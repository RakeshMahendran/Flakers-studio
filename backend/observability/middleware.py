"""
FastAPI middleware for request performance tracking and OTel span enrichment.

- ``PerformanceMiddleware``: Tracks request timing, logs slow requests,
  enriches OTel spans with token usage from request context.
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Thresholds in seconds
SLOW_REQUEST_THRESHOLD = 2.0
VERY_SLOW_REQUEST_THRESHOLD = 5.0


class PerformanceMiddleware(BaseHTTPMiddleware):
    """Track request duration, log slow requests, and enrich OTel spans with token usage."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_s = time.perf_counter() - start
        duration_ms = round(duration_s * 1000, 2)

        # Add timing header in non-production
        response.headers["X-Response-Time-Ms"] = str(duration_ms)

        # Log slow requests
        method = request.method
        path = request.url.path
        status = response.status_code

        if duration_s >= VERY_SLOW_REQUEST_THRESHOLD:
            logger.warning(
                "Very slow request: %s %s %s %.0fms",
                method, path, status, duration_ms,
            )
        elif duration_s >= SLOW_REQUEST_THRESHOLD:
            logger.info(
                "Slow request: %s %s %s %.0fms",
                method, path, status, duration_ms,
            )

        # Enrich OTel span with token usage from request context
        self._enrich_span_with_token_usage()

        return response

    @staticmethod
    def _enrich_span_with_token_usage() -> None:
        """Attach token usage data from the context var to the active OTel span."""
        try:
            from .usage_logging import get_token_usage, clear_token_usage
            token_usage = get_token_usage()
            if not token_usage:
                return

            from opentelemetry import trace
            span = trace.get_current_span()
            if span and span.is_recording():
                for key in ('tenant_id', 'assistant_id', 'user_id', 'task_type',
                            'model', 'input_tokens', 'output_tokens',
                            'total_tokens', 'cost_usd', 'latency_ms'):
                    val = token_usage.get(key)
                    if val is not None:
                        span.set_attribute(f"flakers.genai.{key}", val)

            clear_token_usage()
        except Exception:
            pass
