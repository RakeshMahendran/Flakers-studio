"""
Prometheus-compatible metrics for chat and ingestion.
"""
from __future__ import annotations

from fastapi import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest


chat_requests_total = Counter(
    "flakers_chat_requests_total",
    "Total chat requests processed",
    ["endpoint", "decision"],
)

chat_latency_seconds = Histogram(
    "flakers_chat_latency_seconds",
    "Chat request latency in seconds",
    ["endpoint"],
)

vector_search_requests_total = Counter(
    "flakers_vector_search_requests_total",
    "Total vector search operations",
    ["result"],
)

ingestion_jobs_total = Counter(
    "flakers_ingestion_jobs_total",
    "Total ingestion jobs by terminal status",
    ["status"],
)

ingestion_duration_seconds = Histogram(
    "flakers_ingestion_duration_seconds",
    "Ingestion job duration in seconds",
    ["status"],
)


def observe_chat(endpoint: str, decision: str, duration_seconds: float) -> None:
    chat_requests_total.labels(endpoint=endpoint, decision=decision).inc()
    chat_latency_seconds.labels(endpoint=endpoint).observe(duration_seconds)


def observe_vector_search(result_count: int) -> None:
    result = "hit" if result_count > 0 else "miss"
    vector_search_requests_total.labels(result=result).inc()


def observe_ingestion(status: str, duration_seconds: float | None = None) -> None:
    ingestion_jobs_total.labels(status=status).inc()
    if duration_seconds is not None and duration_seconds >= 0:
        ingestion_duration_seconds.labels(status=status).observe(duration_seconds)


def metrics_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
