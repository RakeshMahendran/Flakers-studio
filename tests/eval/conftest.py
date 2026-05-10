"""Shared fixtures for the RAG evaluation harness.

Design notes
------------
The harness drives the *real* :class:`backend.retrieval.rag_pipeline.RAGPipeline`
but never reaches Azure OpenAI or Qdrant. Instead, three deterministic
fakes are wired in via dependency injection on the pipeline constructor:

* :class:`FakeEmbeddingService` returns a constant zero vector — the
  retrieval service we plug in does not actually use the embedding, so
  this is fine and avoids a network call.
* :class:`FakeRetrievalService` keyword-matches the user query against a
  small in-memory knowledge base. Each KB record has a list of trigger
  tokens, a score, and a chunk payload that mirrors the shape produced
  by ``backend.vector_providers.qdrant_provider``.
* :class:`FakeAzureService` constructs a deterministic answer by
  concatenating the retrieved chunks. This means ``must_contain`` checks
  against KB facts are exercised end-to-end, while still being 100%
  reproducible without a live LLM.

We also stub the SQLAlchemy ``AsyncSession`` because ``RAGPipeline``
creates ``ChatSession``/``ChatMessage`` rows. The fake session swallows
writes and returns no rows for project/message lookups so the pipeline
falls back to ``assistant.name`` and an empty conversation history.

Decision: we use a simple keyword-based retriever rather than a real
TF-IDF/embedding-based one. The point of *this* harness is to detect
behavioral regressions in the pipeline (refusal logic, prompt assembly,
small-talk routing) — not retrieval quality of an external vector store.
Branches that change retrieval ranking should swap in their own
:class:`FakeRetrievalService` with richer scoring.
"""
from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional

import pytest

# Make the repo root importable so ``backend.*`` works regardless of where
# pytest is invoked from. The eval suite is at ``tests/eval/``, so the
# repo root is two parents up from this file.
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


# ---------------------------------------------------------------------------
# Knowledge base used by the fake retriever.
# ---------------------------------------------------------------------------
# Each record represents a chunk that *might* be returned by Qdrant. The
# ``triggers`` list is matched (case-insensitively, substring) against the
# user query. The first time a record matches it is appended to the
# results, capped at the pipeline's ``limit`` (10).
#
# Scores default to 0.85 so they comfortably clear the pipeline's 0.55
# ``score_threshold`` and the governance engine's 0.7 confidence floor
# (the latter is not on the call path the harness exercises today, but we
# keep scores high for forward-compatibility).
@dataclass(frozen=True)
class _KBRecord:
    triggers: tuple
    content: str
    source_url: str
    source_title: str = ""
    intent: str = "support"
    is_policy_content: bool = False
    score: float = 0.85


# Fictional "Acme Cloud" KB — all referenced from question_bank.yaml.
_KNOWLEDGE_BASE: List[_KBRecord] = [
    _KBRecord(
        triggers=("acme cloud", "what is acme", "about acme", "tell me about", "how does it work"),
        content=(
            "Acme Cloud is a developer platform for shipping AI assistants. "
            "It bundles ingestion, retrieval, and governance into a single SaaS product."
        ),
        source_url="https://acme.example/about",
        source_title="About Acme Cloud",
        intent="overview",
    ),
    _KBRecord(
        triggers=("headquarter", "located", "where is acme", "office"),
        content="Acme Cloud is headquartered in San Francisco, California.",
        source_url="https://acme.example/about",
        source_title="About Acme Cloud",
        intent="company",
    ),
    _KBRecord(
        triggers=("founder", "founded", "who founded", "started acme", "ceo"),
        content="Acme Cloud was founded in 2018 by Jane Doe and Alex Smith.",
        source_url="https://acme.example/about",
        source_title="About Acme Cloud",
        intent="company",
    ),
    _KBRecord(
        triggers=("sdk", "language", "programming"),
        content="The Acme SDK supports Python, TypeScript, and Go.",
        source_url="https://acme.example/docs/sdks",
        source_title="SDK Reference",
        intent="docs",
    ),
    _KBRecord(
        triggers=("install", "cli", "command line"),
        content="Install the Acme CLI with: pip install acme-cli",
        source_url="https://acme.example/docs/install",
        source_title="Installation",
        intent="docs",
    ),
    _KBRecord(
        triggers=("database", "integrate", "integration", "datastore"),
        content="Acme integrates with Postgres, MySQL, MongoDB, and Snowflake out of the box.",
        source_url="https://acme.example/docs/integrations",
        source_title="Integrations",
        intent="docs",
    ),
    _KBRecord(
        triggers=("free tier", "free plan", "free", "trial pricing"),
        content="Yes, Acme offers a generous free tier with 1,000 requests per month at no cost.",
        source_url="https://acme.example/pricing",
        source_title="Pricing",
        intent="pricing",
    ),
    _KBRecord(
        triggers=("authentication", "auth", "api key", "authenticate"),
        content="Acme APIs authenticate with an API key passed as the Authorization Bearer header.",
        source_url="https://acme.example/docs/auth",
        source_title="Authentication",
        intent="docs",
    ),
    _KBRecord(
        triggers=("region", "available in", "data center"),
        content="Acme is available in the US, EU, and APAC regions.",
        source_url="https://acme.example/docs/regions",
        source_title="Regions",
        intent="docs",
    ),
    _KBRecord(
        triggers=("team", "engineers", "headcount", "company size"),
        content="The Acme engineering team has roughly 60 engineers across product and platform.",
        source_url="https://acme.example/about",
        source_title="About Acme Cloud",
        intent="company",
    ),
    _KBRecord(
        triggers=("uptime", "sla", "availability"),
        content="Acme guarantees a 99.9% uptime SLA for paid tiers.",
        source_url="https://acme.example/sla",
        source_title="Service Level Agreement",
        intent="docs",
    ),
    _KBRecord(
        triggers=("webhook", "callback", "event"),
        content="Yes, Acme supports webhook delivery for ingestion completion and chat events.",
        source_url="https://acme.example/docs/webhooks",
        source_title="Webhooks",
        intent="docs",
    ),
    _KBRecord(
        triggers=("upload", "file size", "max file"),
        content="The maximum file upload size is 100 MB per request.",
        source_url="https://acme.example/docs/limits",
        source_title="Limits",
        intent="docs",
    ),
    _KBRecord(
        triggers=("soc 2", "compliance", "compliant", "iso"),
        content="Acme is SOC 2 Type II compliant and undergoes annual audits.",
        source_url="https://acme.example/security",
        source_title="Security",
        intent="docs",
    ),
    _KBRecord(
        triggers=("documentation", "docs ", "what languages"),
        content="Acme documentation is available in English, Spanish, and Japanese.",
        source_url="https://acme.example/docs",
        source_title="Documentation",
        intent="docs",
    ),
    # Temporal records
    _KBRecord(
        triggers=("v2 api", "launch", "v2", "version 2"),
        content="The Acme v2 API was launched in March 2024 with streaming support.",
        source_url="https://acme.example/changelog/v2",
        source_title="Changelog",
        intent="docs",
    ),
    _KBRecord(
        triggers=("current stable", "latest version", "current version", "stable version"),
        content="The current stable Acme release is v3.2, available since Q1 2026.",
        source_url="https://acme.example/changelog",
        source_title="Changelog",
        intent="docs",
    ),
    _KBRecord(
        triggers=("maintenance", "downtime", "maintenance window"),
        content="Scheduled maintenance windows occur on Sunday between 02:00 and 04:00 UTC.",
        source_url="https://acme.example/status",
        source_title="Status",
        intent="docs",
    ),
    _KBRecord(
        triggers=("retention", "data retention", "how long is data"),
        content="Acme retains customer log data for 90 days by default; longer retention is available on Enterprise.",
        source_url="https://acme.example/security",
        source_title="Security",
        intent="docs",
    ),
    _KBRecord(
        triggers=("trial", "trial expire", "trial period"),
        content="The Acme trial lasts 14 days, after which the workspace is downgraded to the free tier.",
        source_url="https://acme.example/pricing",
        source_title="Pricing",
        intent="pricing",
    ),
    _KBRecord(
        triggers=("deprecat", "sunset", "removed in"),
        content="The latest release deprecates the v1 webhook payload format; it will be removed in 2026 Q3.",
        source_url="https://acme.example/changelog",
        source_title="Changelog",
        intent="docs",
    ),
    _KBRecord(
        triggers=("support hour", "office hours", "when is support"),
        content="Live support is available 9am to 9pm Pacific, Monday through Friday.",
        source_url="https://acme.example/support",
        source_title="Support",
        intent="contact",
    ),
    # Policy / quote-only content
    _KBRecord(
        triggers=("refund", "money back", "refund policy"),
        content=(
            "Refund policy: customers may request a full refund within 30 days of purchase, "
            "no questions asked, by contacting billing@acme.example."
        ),
        source_url="https://acme.example/legal/refunds",
        source_title="Refund Policy",
        intent="policy",
        is_policy_content=True,
    ),
    _KBRecord(
        triggers=("privacy", "data sharing", "share data"),
        content=(
            "Privacy policy: Acme does not sell customer data and does not share personal "
            "data with third parties except as required to operate the service."
        ),
        source_url="https://acme.example/legal/privacy",
        source_title="Privacy Policy",
        intent="policy",
        is_policy_content=True,
    ),
    _KBRecord(
        triggers=("terms of service", "tos", "liability", "limitation of liability"),
        content=(
            "Terms of service: Acme's total liability under these terms is limited to "
            "the amount paid by Customer in the 12 months prior to the event giving rise to liability."
        ),
        source_url="https://acme.example/legal/tos",
        source_title="Terms of Service",
        intent="policy",
        is_policy_content=True,
    ),
    _KBRecord(
        triggers=("acceptable use", "aup", "usage policy"),
        content=(
            "Acceptable use policy: customers must not use Acme to send spam, host malicious "
            "content, or violate any applicable law. Violations may result in account suspension."
        ),
        source_url="https://acme.example/legal/aup",
        source_title="Acceptable Use Policy",
        intent="policy",
        is_policy_content=True,
    ),
    # Pricing / contact
    _KBRecord(
        triggers=("pro plan", "pro tier", "pro pricing", "how much"),
        content="The Pro plan costs $49 per user per month, billed monthly.",
        source_url="https://acme.example/pricing",
        source_title="Pricing",
        intent="pricing",
    ),
    _KBRecord(
        triggers=("enterprise", "enterprise plan"),
        content=(
            "The Enterprise plan includes SSO, SOC 2 reports, dedicated support, and a 99.9% uptime SLA. "
            "Pricing is custom — contact sales@acme.example."
        ),
        source_url="https://acme.example/pricing",
        source_title="Pricing",
        intent="pricing",
    ),
    _KBRecord(
        triggers=("contact sales", "sales", "talk to sales"),
        content="To contact sales, email sales@acme.example or book a call at https://acme.example/sales.",
        source_url="https://acme.example/contact",
        source_title="Contact",
        intent="contact",
    ),
    _KBRecord(
        triggers=("support email", "contact support", "help email"),
        content="For support, email support@acme.example or open a ticket from your dashboard.",
        source_url="https://acme.example/contact",
        source_title="Contact",
        intent="contact",
    ),
    _KBRecord(
        triggers=("annual", "yearly", "discount", "annual billing"),
        content="Customers who choose annual billing receive a 20% discount versus monthly.",
        source_url="https://acme.example/pricing",
        source_title="Pricing",
        intent="pricing",
    ),
]


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------
class FakeEmbeddingService:
    """Returns a deterministic, low-dimensional vector.

    Since the fake retriever needs the *raw* query string (not its
    embedding) to do keyword matching, and the pipeline only hands us
    the user message at this stage, we capture it on a partner
    :class:`FakeRetrievalService` so the next ``search`` call can see it.
    The embedding itself is a constant zero vector.
    """

    def __init__(self, retrieval_service: Optional["FakeRetrievalService"] = None) -> None:
        self.retrieval_service = retrieval_service

    async def embed_text(self, text: str) -> List[float]:  # noqa: D401 - matches real signature
        if self.retrieval_service is not None:
            self.retrieval_service.last_query = text
        return [0.0] * 8

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [[0.0] * 8 for _ in texts]


class FakeRetrievalService:
    """Keyword-driven stand-in for ``RetrievalService``.

    Stores the last query and what it returned for inspection by tests.
    """

    def __init__(self, knowledge_base: Iterable[_KBRecord] = _KNOWLEDGE_BASE) -> None:
        self.knowledge_base = list(knowledge_base)
        self.last_query: Optional[str] = None
        self.last_results: List[Dict[str, Any]] = []

    async def search_assistant_content(
        self,
        *,
        assistant_id: str,
        query_embedding: List[float],
        limit: int,
        score_threshold: float,
        assistant_name: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        # The pipeline passes the user's question into us indirectly via
        # the embedding; we cheat and use the captured query stored on
        # the instance by the harness before each call.
        query = (self.last_query or "").lower()
        results: List[Dict[str, Any]] = []
        for record in self.knowledge_base:
            if record.score < score_threshold:
                continue
            if any(trigger in query for trigger in record.triggers):
                results.append(
                    {
                        "id": f"chunk-{len(results)}",
                        "content": record.content,
                        "source_url": record.source_url,
                        "source_title": record.source_title,
                        "intent": record.intent,
                        "is_policy_content": record.is_policy_content,
                        "score": record.score,
                        "tenant_id": None,  # bypass tenant isolation in governance
                    }
                )
            if len(results) >= limit:
                break
        self.last_results = results
        return results


class FakeAzureService:
    """Deterministic completion service.

    The completion is built by concatenating the retrieved chunk content,
    which lets ``must_contain`` checks key off real KB facts without a
    real LLM. When no chunks are retrieved we still need to produce a
    sensible answer for the small-talk / fallback paths in the pipeline.
    """

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []

    async def generate_response(
        self,
        *,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1000,
        temperature: float = 0.1,
        tenant_id: Optional[str] = None,
        assistant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.calls.append(
            {
                "system_prompt": system_prompt,
                "user_message": user_message,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        )
        # If the pipeline embedded retrieved context into the system
        # prompt, surface it back in the answer so substring assertions
        # work. The pipeline uses the literal string ``"Content: "`` as
        # a delimiter — see rag_pipeline.py.
        snippets: List[str] = []
        for line in system_prompt.splitlines():
            if line.startswith("Content: "):
                snippets.append(line[len("Content: ") :])
        if snippets:
            content = " ".join(snippets)
        else:
            # No retrieved context. Decide based on the user_message.
            content = _fallback_answer(user_message)

        return {
            "content": content,
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30,
                "model": "fake-deployment",
            },
            "finish_reason": "stop",
        }


def _fallback_answer(user_message: str) -> str:
    """Generate a reasonable canned answer for the no-context branch."""
    text = (user_message or "").lower().strip()
    if not text:
        return "Hello! How can I help today?"
    if text.startswith(("hi", "hey", "hello", "yo", "good ")):
        return "Hi there! How can I help?"
    if "thank" in text:
        return "You're welcome! Let me know if there's anything else."
    if "bye" in text or "goodbye" in text:
        return "Goodbye! Have a great day."
    if "how are you" in text:
        return "I'm doing well, thanks for asking. How can I help?"
    # Generic fallback that does not hallucinate KB content.
    return (
        "I don't have specific information about that in my knowledge base, "
        "but I'm happy to help with questions about the assistant's site."
    )


# ---------------------------------------------------------------------------
# Database fakes
# ---------------------------------------------------------------------------
class _Result:
    """Mimic the subset of the SQLAlchemy ``Result`` API the pipeline uses."""

    def __init__(self, value: Any = None, scalars: Optional[List[Any]] = None) -> None:
        self._value = value
        self._scalars = scalars or []

    def scalar_one_or_none(self) -> Any:
        return self._value

    def scalars(self) -> "_Scalars":
        return _Scalars(self._scalars)


class _Scalars:
    def __init__(self, items: List[Any]) -> None:
        self._items = items

    def all(self) -> List[Any]:
        return list(self._items)


class FakeAsyncSession:
    """Async-compatible stand-in for ``AsyncSession``.

    The pipeline issues three ``execute()`` calls per query: lookup the
    chat session by id, lookup the project by id, and load recent chat
    messages. None of those need to return real rows for the harness —
    the pipeline gracefully handles ``None`` and empty lists.
    """

    def __init__(self) -> None:
        self.added: List[Any] = []

    async def execute(self, _statement: Any) -> _Result:
        return _Result(value=None, scalars=[])

    def add(self, obj: Any) -> None:
        # Auto-populate ``id`` so ``ChatSession.id`` is usable downstream.
        if not getattr(obj, "id", None):
            try:
                obj.id = uuid.uuid4()
            except Exception:
                pass
        self.added.append(obj)

    async def commit(self) -> None:
        return None

    async def refresh(self, obj: Any) -> None:
        return None


# ---------------------------------------------------------------------------
# Assistant + pipeline fixtures
# ---------------------------------------------------------------------------
def _make_assistant() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.UUID("00000000-0000-0000-0000-00000000a551"),
        tenant_id=uuid.UUID("00000000-0000-0000-0000-0000000000a1"),
        project_id=uuid.UUID("00000000-0000-0000-0000-000000000bb1"),
        name="Acme Cloud Assistant",
        site_url="https://acme.example",
        status="ready",
    )


@pytest.fixture
def fake_assistant() -> SimpleNamespace:
    return _make_assistant()


@pytest.fixture
def fake_db() -> FakeAsyncSession:
    return FakeAsyncSession()


@pytest.fixture
def fake_retrieval() -> FakeRetrievalService:
    return FakeRetrievalService()


@pytest.fixture
def fake_azure() -> FakeAzureService:
    return FakeAzureService()


@pytest.fixture
def fake_embeddings(fake_retrieval) -> FakeEmbeddingService:
    return FakeEmbeddingService(retrieval_service=fake_retrieval)


@pytest.fixture
def rag_pipeline(fake_embeddings, fake_azure, fake_retrieval):
    """Construct a ``RAGPipeline`` wired up with fakes only.

    Importing here (rather than at module top) defers SQLAlchemy and
    pydantic-settings imports until pytest has applied any environment
    overrides we may want in the future.
    """
    # Belt-and-braces: re-assert the repo root on sys.path. Pytest's
    # rootdir-based collection prepends ``tests/`` to ``sys.path``,
    # which means ``import backend`` resolves to the *test* helpers
    # under ``tests/backend/__init__.py`` instead of the real
    # ``backend`` package. We work around this by:
    #   1. Putting the repo root at the very front of sys.path.
    #   2. Evicting any cached ``backend.*`` modules whose origin is
    #      under ``tests/`` so the next import re-resolves.
    repo_root = str(REPO_ROOT)
    if sys.path[0] != repo_root:
        # Remove duplicates first, then prepend.
        sys.path[:] = [p for p in sys.path if p != repo_root]
        sys.path.insert(0, repo_root)

    tests_dir = str(REPO_ROOT / "tests")
    for mod_name in [m for m in list(sys.modules) if m == "backend" or m.startswith("backend.")]:
        mod = sys.modules.get(mod_name)
        mod_file = getattr(mod, "__file__", None) or ""
        mod_path = getattr(mod, "__path__", None) or []
        if (mod_file and mod_file.startswith(tests_dir)) or any(
            str(p).startswith(tests_dir) for p in mod_path
        ):
            sys.modules.pop(mod_name, None)

    from backend.retrieval.rag_pipeline import RAGPipeline

    return RAGPipeline(
        embedding_service=fake_embeddings,
        azure_service=fake_azure,
        retrieval_service=fake_retrieval,
    )
