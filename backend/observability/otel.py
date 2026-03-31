"""
OpenTelemetry + Azure Application Insights setup for FlakersStudio.

Configures three signal pipelines when a valid App Insights connection string
is present:

  1. **Traces** — FastAPI, asyncpg, httpx auto-instrumentation + custom
     GenAI spans created by ``usage_logging.log_token_usage``.
  2. **Metrics** — GenAI counters (token usage, LLM call count) and histograms
     (LLM latency) with ``user_id / tenant_id / task_type`` dimensions.
  3. **Logs** — Python ``logging`` records forwarded to App Insights so
     structured token-usage entries appear as ``traces`` / ``customEvents``.

All three are optional — if the connection string is missing or placeholder
the app runs without telemetry.
"""

import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Module-level handles populated by setup_otel() ──
_tracer = None
_meter = None

# Metrics instruments (created once in setup_otel, used by usage_logging)
llm_token_counter = None
llm_call_counter = None
llm_cost_counter = None
llm_latency_histogram = None


def get_tracer():
    """Return the app tracer, or None if OTel is not configured."""
    return _tracer


def get_meter():
    """Return the app meter, or None if OTel is not configured."""
    return _meter


def setup_otel(app=None):
    """Setup OpenTelemetry with Azure Application Insights.

    Safe to call at startup — silently skips when the connection string is
    absent or any OTel package is missing.

    Args:
        app: Optional FastAPI app instance for auto-instrumentation.
    """
    global _tracer, _meter
    global llm_token_counter, llm_call_counter, llm_cost_counter, llm_latency_histogram

    connection_string = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING')

    if not connection_string or connection_string.endswith('00000000-0000-0000-0000-000000000000'):
        logger.info("OpenTelemetry setup skipped - no valid Application Insights connection string")
        logger.info("To enable, set APPLICATIONINSIGHTS_CONNECTION_STRING in environment")
        return

    try:
        # ── Core imports ──
        try:
            from opentelemetry import trace, metrics
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor
            from opentelemetry.sdk.metrics import MeterProvider
            from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
            from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
            from azure.monitor.opentelemetry.exporter import (
                AzureMonitorTraceExporter,
                AzureMonitorMetricExporter,
                AzureMonitorLogExporter,
            )
        except ImportError as e:
            logger.warning(f"OpenTelemetry packages not available: {e}")
            logger.info("Continuing without OpenTelemetry instrumentation")
            return

        # ── Resource (shared across all signals) ──
        resource = Resource.create({
            "service.name": os.getenv('SERVICE_NAME', 'flakers-studio-backend'),
            "service.instance.id": os.getenv('HOSTNAME', 'localhost'),
            "service.version": os.getenv('APP_VERSION', '1.0.0'),
            "deployment.environment": os.getenv('ENVIRONMENT', 'development'),
        })

        # ── 1. Traces ──
        tracer_provider = TracerProvider(resource=resource)
        trace_exporter = AzureMonitorTraceExporter.from_connection_string(connection_string)
        tracer_provider.add_span_processor(BatchSpanProcessor(trace_exporter))
        trace.set_tracer_provider(tracer_provider)
        _tracer = trace.get_tracer("flakers.genai", "1.0.0")
        logger.info("Traces pipeline configured")

        # ── 2. Metrics ──
        try:
            metric_exporter = AzureMonitorMetricExporter.from_connection_string(connection_string)
            metric_reader = PeriodicExportingMetricReader(
                metric_exporter,
                export_interval_millis=60_000,
            )
            meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
            metrics.set_meter_provider(meter_provider)
            _meter = metrics.get_meter("flakers.genai", "1.0.0")

            llm_token_counter = _meter.create_counter(
                name="genai.token.usage",
                description="Cumulative token usage across all GenAI calls",
                unit="token",
            )
            llm_call_counter = _meter.create_counter(
                name="genai.calls",
                description="Number of GenAI LLM calls",
                unit="call",
            )
            llm_cost_counter = _meter.create_counter(
                name="genai.cost",
                description="Estimated cost of GenAI calls",
                unit="USD",
            )
            llm_latency_histogram = _meter.create_histogram(
                name="genai.latency",
                description="LLM call duration",
                unit="ms",
            )
            logger.info("Metrics pipeline configured (4 instruments)")
        except Exception as e:
            logger.warning(f"Metrics pipeline setup failed: {e}")

        # ── 3. Logs ──
        try:
            log_exporter = AzureMonitorLogExporter.from_connection_string(connection_string)
            logger_provider = LoggerProvider(resource=resource)
            logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

            otel_handler = LoggingHandler(
                level=logging.INFO,
                logger_provider=logger_provider,
            )
            logging.getLogger().addHandler(otel_handler)
            logger.info("Logs pipeline configured (root logger -> App Insights)")
        except Exception as e:
            logger.warning(f"Logs pipeline setup failed: {e}")

        # ── Auto-instrumentation ──
        _instrument_fastapi(app)
        _instrument_asyncpg()
        _instrument_httpx()

        logger.info("OpenTelemetry setup completed — traces, metrics, and logs enabled")

    except Exception as e:
        logger.error(f"Failed to setup OpenTelemetry: {e}")
        logger.info("Continuing without OpenTelemetry — basic logging is still active")


# ── Auto-instrumentors (isolated so one failure doesn't block others) ──

def _instrument_fastapi(app=None):
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        if app:
            FastAPIInstrumentor.instrument_app(app)
        else:
            FastAPIInstrumentor().instrument()
        logger.info("FastAPI instrumentation enabled")
    except Exception as e:
        logger.warning(f"FastAPI instrumentation failed: {e}")


def _instrument_asyncpg():
    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
        AsyncPGInstrumentor().instrument()
        logger.info("AsyncPG instrumentation enabled")
    except Exception as e:
        logger.warning(f"AsyncPG instrumentation failed: {e}")


def _instrument_httpx():
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HTTPXClientInstrumentor().instrument()
        logger.info("HTTPX instrumentation enabled")
    except Exception as e:
        logger.warning(f"HTTPX instrumentation failed: {e}")
