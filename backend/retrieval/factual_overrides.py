"""
Per-assistant factual override store.

Some questions have a single, canonical answer that should never be
synthesised by the LLM from a noisy chunk soup — "who is the CEO",
"what's your office address", "where are you headquartered". For these,
the assistant owner provides a curated answer + the source URL it
came from. The retrieval pipeline matches the user's query against
the override's trigger keywords and, if the organic Qdrant hits
don't already include a high-confidence match for the canonical
URL, prepends a synthetic context chunk with the canonical answer
verbatim (and ``source_url`` so governance still treats it as
ATTRIBUTED).

Storage:
    Overrides live in ``Assistant.factual_overrides`` (JSONB column,
    default ``[]``). Each entry has the shape::

        {
            "trigger_keywords": ["ceo", "chief executive"],
            "canonical_answer": "The CEO of FlakersStudio is Jane Doe.",
            "source_url": "https://example.com/about/leadership",
            "confidence": 1.0,
            "boost": 0.5
        }

Matching:
    A query matches an override if **all** of the override's
    ``trigger_keywords`` appear (case-insensitively, with word
    boundaries) in the query. The first override that matches wins —
    callers should order entries from most specific to least specific.

This module deliberately does **not** import the SQLAlchemy ``Assistant``
model at module-import time so unit tests can construct the store with
a plain dict.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


# Defaults applied when an override entry omits these fields. ``boost``
# is the multiplicative bonus added to a hit whose ``source_url`` matches
# the override (final multiplier is ``1 + boost``). 0.5 -> +50%.
_DEFAULT_BOOST = 0.5
_DEFAULT_CONFIDENCE = 1.0


@dataclass
class FactualOverride:
    """Curator-supplied canonical answer for a class of factual queries."""

    trigger_keywords: List[str]
    canonical_answer: str
    source_url: str
    confidence: float = _DEFAULT_CONFIDENCE
    boost: float = _DEFAULT_BOOST
    # Optional human-readable label, surfaced to the chunk ``source_title``
    # field so the UI can show "From: About → Leadership" rather than the
    # bare URL. Falls back to ``source_url`` when omitted.
    source_title: Optional[str] = None

    def as_synthetic_chunk(self) -> Dict[str, Any]:
        """Render this override as a synthetic Qdrant-shaped hit.

        The dict mirrors the keys produced by
        :meth:`backend.vector_providers.qdrant_provider.QdrantVectorStore.search`
        so downstream code (context assembly, governance, source list)
        can treat it identically to an organic retrieval result.

        ``score`` is hard-coded to 1.0 so the rerank step keeps the
        synthetic hit at the head of the list.
        """
        return {
            "id": f"factual-override::{self.source_url}",
            "score": 1.0,
            "content": self.canonical_answer,
            "source_url": self.source_url,
            "source_title": self.source_title or self.source_url,
            "source_type": "factual_override",
            "intent": "factual",
            # Critical: governance reads ``requires_attribution`` and
            # ``source_url`` to classify a chunk as ATTRIBUTED. Carry both.
            "requires_attribution": True,
            "is_policy_content": False,
            "is_sensitive": False,
            "confidence_score": self.confidence,
            "metadata": {
                "factual_override": True,
                "trigger_keywords": list(self.trigger_keywords),
            },
        }


@dataclass
class FactualOverrideStore:
    """Per-assistant lookup over a list of :class:`FactualOverride`.

    Construct with :meth:`from_assistant` (preferred — pulls the JSONB
    column off an Assistant ORM instance) or pass a raw list when you
    need to seed one in tests.
    """

    overrides: List[FactualOverride] = field(default_factory=list)

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    @classmethod
    def from_assistant(cls, assistant: Any) -> "FactualOverrideStore":
        """Build a store from an ``Assistant`` ORM object.

        Tolerates a missing column (older DBs without the migration
        applied) by returning an empty store.
        """
        raw = getattr(assistant, "factual_overrides", None) or []
        return cls.from_raw(raw)

    @classmethod
    def from_raw(cls, raw: Iterable[Dict[str, Any]]) -> "FactualOverrideStore":
        """Build a store from a JSON-shaped list. Skips malformed entries."""
        overrides: List[FactualOverride] = []
        if not raw:
            return cls(overrides=overrides)
        for entry in raw:
            override = _parse_entry(entry)
            if override is not None:
                overrides.append(override)
        return cls(overrides=overrides)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def find_match(self, query: str) -> Optional[FactualOverride]:
        """Return the first override whose triggers all match ``query``.

        Matching is lower-cased and word-boundary aware (so "ceo" does
        not match "ceo-suite-pricing"). Returns ``None`` when no
        override matches or when the query is empty.
        """
        if not query or not self.overrides:
            return None
        normalised = query.lower()
        for override in self.overrides:
            if _all_keywords_present(override.trigger_keywords, normalised):
                return override
        return None

    @property
    def is_empty(self) -> bool:
        return not self.overrides

    def __len__(self) -> int:  # convenience for tests / debug logging
        return len(self.overrides)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _contains_prompt_injection_markers(text: str) -> bool:
    """Detect potential prompt injection attempts in canonical_answer.

    Returns True if the text contains suspicious patterns like:
    - System prompt override attempts
    - Role confusion markers
    - Instruction injection patterns

    This is a defense-in-depth measure. The canonical answer is
    properly labeled as "retrieved content" in the system prompt,
    but we still reject obvious injection attempts at parse time.
    """
    text_lower = text.lower()
    suspicious_patterns = [
        "ignore previous instructions",
        "ignore all previous",
        "disregard previous",
        "you are now",
        "new instructions:",
        "system:",
        "assistant:",
        "[system]",
        "[assistant]",
        "<|im_start|>",
        "<|im_end|>",
        "{{system}}",
        "{{user}}",
    ]
    for pattern in suspicious_patterns:
        if pattern in text_lower:
            return True
    return False


def _parse_entry(entry: Any) -> Optional[FactualOverride]:
    """Coerce a raw JSON dict into a :class:`FactualOverride`.

    Returns ``None`` when required fields are missing — bad rows must
    never break the pipeline, they just don't fire.
    """
    if not isinstance(entry, dict):
        return None
    keywords = entry.get("trigger_keywords")
    if not isinstance(keywords, list) or not keywords:
        return None
    cleaned_keywords: List[str] = []
    for kw in keywords:
        if isinstance(kw, str) and kw.strip():
            cleaned_keywords.append(kw.strip().lower())
    if not cleaned_keywords:
        return None

    canonical = entry.get("canonical_answer")
    source_url = entry.get("source_url")
    if not isinstance(canonical, str) or not canonical.strip():
        return None
    if not isinstance(source_url, str) or not source_url.strip():
        return None

    # Sanitize canonical_answer: reject if it contains potential prompt injection markers
    canonical_text = canonical.strip()
    if _contains_prompt_injection_markers(canonical_text):
        logger.warning(
            "Factual override rejected: canonical_answer contains potential prompt injection markers"
        )
        return None

    # Validate canonical_answer length (max 5000 chars to prevent abuse)
    if len(canonical_text) > 5000:
        logger.warning(
            "Factual override rejected: canonical_answer exceeds 5000 characters"
        )
        return None

    boost = entry.get("boost", _DEFAULT_BOOST)
    try:
        boost_val = float(boost)
        # Clamp boost to reasonable range [-0.9, 5.0] to prevent negative scores or overflow
        if boost_val < -0.9:
            logger.warning("Boost value %s clamped to -0.9", boost_val)
            boost_val = -0.9
        elif boost_val > 5.0:
            logger.warning("Boost value %s clamped to 5.0", boost_val)
            boost_val = 5.0
    except (TypeError, ValueError):
        boost_val = _DEFAULT_BOOST

    confidence = entry.get("confidence", _DEFAULT_CONFIDENCE)
    try:
        confidence_val = float(confidence)
        # Clamp confidence to [0.0, 1.0]
        confidence_val = max(0.0, min(1.0, confidence_val))
    except (TypeError, ValueError):
        confidence_val = _DEFAULT_CONFIDENCE

    title = entry.get("source_title")
    title_val: Optional[str] = None
    if isinstance(title, str) and title.strip():
        title_val = title.strip()

    return FactualOverride(
        trigger_keywords=cleaned_keywords,
        canonical_answer=canonical_text,
        source_url=source_url.strip(),
        confidence=confidence_val,
        boost=boost_val,
        source_title=title_val,
    )


# Cache compiled regex per keyword. Keywords are tiny strings (1-3 words),
# so a simple per-process dict avoids re-compiling the same pattern on
# every query. We cap the cache at 1000 entries to prevent unbounded growth.
_KEYWORD_REGEX_CACHE: Dict[str, "re.Pattern[str]"] = {}
_MAX_REGEX_CACHE_SIZE = 1000


def _keyword_regex(keyword: str) -> "re.Pattern[str]":
    """Compile a word-boundary regex for a single (already lower-cased) keyword.

    Multi-word keywords like ``"chief executive"`` are matched as a
    flexible-whitespace phrase so we don't reject queries that use a
    tab or double space between the words.
    """
    cached = _KEYWORD_REGEX_CACHE.get(keyword)
    if cached is not None:
        return cached

    # If cache is full, clear the oldest 20% of entries (simple FIFO eviction)
    if len(_KEYWORD_REGEX_CACHE) >= _MAX_REGEX_CACHE_SIZE:
        keys_to_remove = list(_KEYWORD_REGEX_CACHE.keys())[: _MAX_REGEX_CACHE_SIZE // 5]
        for key in keys_to_remove:
            del _KEYWORD_REGEX_CACHE[key]
        logger.debug("Regex cache eviction: removed %d entries", len(keys_to_remove))

    parts = [re.escape(part) for part in keyword.split() if part]
    if not parts:
        # Pathological input — fall back to a regex that never matches.
        pattern = re.compile(r"(?!x)x")
    else:
        body = r"\s+".join(parts)
        pattern = re.compile(rf"\b{body}\b", re.IGNORECASE)
    _KEYWORD_REGEX_CACHE[keyword] = pattern
    return pattern


def _all_keywords_present(keywords: List[str], normalised_query: str) -> bool:
    for kw in keywords:
        if not _keyword_regex(kw).search(normalised_query):
            return False
    return True


def reset_regex_cache_for_tests() -> None:
    """Test helper — clears the per-process compiled-regex cache."""
    _KEYWORD_REGEX_CACHE.clear()
