"""
FlakersStudio Backend - Governance-First AI Assistant Platform
"""
import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from backend.config.settings import settings
from backend.api.routes import assistant, chat, auth, projects, analytics, public_chat, status
from backend.config.database import init_db
from backend.config.logging import configure_logging, log_context
from backend.observability.metrics import metrics_response
from backend.observability.otel import setup_otel
from backend.vector_providers.qdrant_provider import init_qdrant
from backend.observability.middleware import PerformanceMiddleware

load_dotenv()
configure_logging()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    if settings.using_default_secret_key:
        logger.warning("Application is using the default SECRET_KEY")

    # Initialize database
    await init_db()
    
    # Initialize Qdrant
    await init_qdrant()

    # Initialize OpenTelemetry + App Insights
    setup_otel(app)

    yield
    
    # Cleanup on shutdown
    pass

app = FastAPI(
    title="FlakersStudio API",
    description="Governance-first AI assistant platform for enterprises",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(settings.ALLOWED_ORIGINS + settings.PUBLIC_WIDGET_ALLOWED_ORIGINS)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Performance monitoring middleware
app.add_middleware(PerformanceMiddleware)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])
app.include_router(assistant.router, prefix="/assistant", tags=["assistants"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(analytics.router, prefix="/api/v1", tags=["analytics"])
app.include_router(public_chat.router, prefix="/api/v1", tags=["public-chat"])
app.include_router(status.router, prefix="/api/v1", tags=["status"])


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    with log_context(request_id=request_id):
        logger.info("Request started %s %s", request.method, request.url.path)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        logger.info("Request completed %s %s status=%s", request.method, request.url.path, response.status_code)
        return response

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "FlakersStudio API"}


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return metrics_response()

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Disable reload to avoid interference with background tasks
        workers=1,  # Single worker for memory efficiency
        limit_concurrency=100,  # Increase from 10 to avoid blocking
        timeout_keep_alive=5,  # Reduce keep-alive timeout
        access_log=True  # Enable access logs for debugging
    )
