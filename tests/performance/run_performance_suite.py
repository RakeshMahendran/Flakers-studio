from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.ingestion.ingestion import IngestionService
from backend.models.assistant import AssistantStatus
from backend.models.content import JobStatus
from backend.models.ingestion_tracking import URLStatus
from backend.retrieval.rag_pipeline import RAGPipeline


BASELINE_PATH = Path(__file__).with_name("baselines.json")


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ScalarsResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _CollectionResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarsResult(self._values)


class FakeChatDB:
    def __init__(self):
        self.session = None
        self.messages = []
        self.project = SimpleNamespace(name="Benchmark Project")

    async def execute(self, statement):
        statement_text = str(statement)
        if "FROM projects" in statement_text:
            return _ScalarResult(self.project)
        if "FROM chat_messages" in statement_text:
            return _CollectionResult(list(self.messages))
        if "FROM chat_sessions" in statement_text:
            return _ScalarResult(self.session)
        raise AssertionError(f"Unexpected statement: {statement_text}")

    def add(self, obj):
        if getattr(obj, "__tablename__", "") == "chat_sessions":
            self.session = obj
            self.session.id = "session-1"
        elif getattr(obj, "__tablename__", "") == "chat_messages":
            self.messages.append(obj)

    async def commit(self):
        return None

    async def refresh(self, obj):
        if not getattr(obj, "id", None):
            obj.id = "session-1"


class FakeIngestionDB:
    def __init__(self):
        self.job = SimpleNamespace(
            id="job-1",
            assistant_id="assistant-1",
            tenant_id="tenant-1",
            status=JobStatus.QUEUED.value,
            current_stage="queued",
            started_at=datetime.utcnow(),
            completed_at=None,
            cancelled_at=None,
            cancellation_reason=None,
            total_chunks_created=0,
            urls_processed=0,
            urls_completed=0,
            chunks_uploaded=0,
            error_details=[],
            errors_count=0,
            should_cancel=lambda: False,
        )
        self.assistant = SimpleNamespace(
            id="assistant-1",
            status=AssistantStatus.INGESTING,
            status_message="Ingesting",
            total_chunks_indexed="0",
            total_pages_crawled="0",
            last_ingestion_at=None,
        )
        self.urls = [
            SimpleNamespace(
                url="https://example.com/docs",
                title="Docs",
                raw_content="Useful benchmark content.",
                content_type="support",
                scraped_at=datetime.utcnow(),
                status=URLStatus.SCRAPED.value,
                chunk_count=0,
                processed_at=None,
            )
        ]
        self.persisted_chunks = []

    async def get(self, model, object_id):
        if object_id == self.job.id:
            return self.job
        if object_id == self.assistant.id:
            return self.assistant
        return None

    async def execute(self, statement):
        statement_text = str(statement)
        if "FROM ingestion_urls" in statement_text:
            return _CollectionResult(self.urls)
        if "FROM assistants" in statement_text:
            return _ScalarResult(self.assistant)
        raise AssertionError(f"Unexpected statement: {statement_text}")

    def add(self, obj):
        self.persisted_chunks.append(obj)

    async def commit(self):
        return None


class FakeEmbeddingService:
    async def embed_text(self, _text):
        return [0.1, 0.2, 0.3]

    async def embed_texts(self, texts):
        return [[0.1, 0.2, 0.3] for _ in texts]


class FakeAzureService:
    async def generate_response(self, **_kwargs):
        return {
            "content": "Benchmark answer with source attribution.",
            "usage": {"prompt_tokens": 10, "completion_tokens": 20, "model": "benchmark-model"},
        }


class FakeRetrievalService:
    async def search_assistant_content(self, **_kwargs):
        return [
            {
                "id": "chunk-1",
                "source_url": "https://example.com/docs",
                "source_title": "Docs",
                "content": "Useful benchmark content.",
                "intent": "support",
            }
        ]


def percentile_ms(samples: list[float], percentile: float) -> float:
    if not samples:
        return 0.0
    ordered = sorted(samples)
    index = min(len(ordered) - 1, max(0, int(round((percentile / 100) * len(ordered) + 0.5)) - 1))
    return ordered[index]


async def benchmark_chat(iterations: int) -> dict[str, float]:
    db = FakeChatDB()
    assistant = SimpleNamespace(
        id="assistant-1",
        tenant_id="tenant-1",
        project_id="project-1",
        name="Benchmark Assistant",
        site_url="https://example.com",
    )
    pipeline = RAGPipeline(
        embedding_service=FakeEmbeddingService(),
        azure_service=FakeAzureService(),
        retrieval_service=FakeRetrievalService(),
    )

    durations = []
    for _ in range(iterations):
        start = time.perf_counter()
        result = await pipeline.handle_query(
            db=db,
            assistant=assistant,
            user_message="What does the benchmark assistant do?",
        )
        durations.append((time.perf_counter() - start) * 1000)
        if result["decision"] != "ANSWER":
            raise AssertionError("Chat benchmark returned a non-answer decision")

    return {
        "iterations": iterations,
        "mean_ms": round(statistics.mean(durations), 3),
        "p95_ms": round(percentile_ms(durations, 95), 3),
    }


async def benchmark_ingestion(iterations: int) -> dict[str, float]:
    durations = []

    for _ in range(iterations):
        service = IngestionService()
        fake_db = FakeIngestionDB()
        service.processor.process_scraped_pages = lambda _pages: [
            SimpleNamespace(
                content="Useful benchmark content.",
                source_url="https://example.com/docs",
                source_title="Docs",
                source_type="website",
                intent=SimpleNamespace(value="support"),
                confidence_score=0.99,
                requires_attribution=True,
                is_policy_content=False,
                is_sensitive=False,
                chunk_index=0,
                chunk_size=25,
                content_hash="chunk-hash",
                metadata={"benchmark": True},
            )
        ]
        service.embedding_service = FakeEmbeddingService()

        @asynccontextmanager
        async def fake_session_local():
            yield fake_db

        start = time.perf_counter()
        with patch("backend.ingestion.ingestion.AsyncSessionLocal", fake_session_local), \
             patch("backend.ingestion.ingestion.ensure_assistant_collection", new=AsyncMock(return_value=None)), \
             patch("backend.ingestion.ingestion.store_embeddings", new=AsyncMock(return_value=["point-1"])), \
             patch("backend.ingestion.ingestion.observe_ingestion"):
            await service._process_ingestion(
                job_id="job-1",
                assistant_id="assistant-1",
                assistant_name="Benchmark Assistant",
                user_name="bench",
            )
        durations.append((time.perf_counter() - start) * 1000)

        if fake_db.job.status != JobStatus.COMPLETED.value:
            raise AssertionError("Ingestion benchmark did not complete successfully")

    return {
        "iterations": iterations,
        "mean_ms": round(statistics.mean(durations), 3),
        "p95_ms": round(percentile_ms(durations, 95), 3),
    }


async def run_benchmarks(benchmark: str, iterations: int) -> dict[str, dict[str, float]]:
    selected = {}
    if benchmark in {"all", "chat"}:
        selected["chat_route"] = await benchmark_chat(iterations)
    if benchmark in {"all", "ingestion"}:
        selected["ingestion_pipeline"] = await benchmark_ingestion(iterations)
    return selected


def validate_baselines(results: dict[str, dict[str, float]]) -> None:
    baselines = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    failures = []

    if "chat_route" in results and results["chat_route"]["p95_ms"] > baselines["chat_route_p95_ms"]:
        failures.append(
            f"chat_route p95 {results['chat_route']['p95_ms']}ms exceeded baseline {baselines['chat_route_p95_ms']}ms"
        )

    if "ingestion_pipeline" in results and results["ingestion_pipeline"]["p95_ms"] > baselines["ingestion_pipeline_p95_ms"]:
        failures.append(
            "ingestion_pipeline p95 "
            f"{results['ingestion_pipeline']['p95_ms']}ms exceeded baseline {baselines['ingestion_pipeline_p95_ms']}ms"
        )

    if failures:
        raise SystemExit("\n".join(failures))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Flakers Studio mock-backed performance benchmarks.")
    parser.add_argument("--benchmark", choices=["all", "chat", "ingestion"], default="all")
    parser.add_argument("--iterations", type=int, default=10)
    parser.add_argument("--check-baseline", action="store_true")
    args = parser.parse_args()

    results = asyncio.run(run_benchmarks(args.benchmark, args.iterations))
    print(json.dumps(results, indent=2))

    if args.check_baseline:
        validate_baselines(results)


if __name__ == "__main__":
    main()
