"""
FlakersStudio Backend - Governance-First AI Assistant Platform
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from app.core.config import settings
from app.api.routes import assistant, chat, auth, projects, analytics, status
from app.core.database import init_db
from app.core.qdrant_client import init_qdrant

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup"""
    # Initialize database
    await init_db()
    
    # Initialize Qdrant
    await init_qdrant()
    
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
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])
app.include_router(assistant.router, prefix="/assistant", tags=["assistants"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(analytics.router, prefix="/api/v1", tags=["analytics"])
app.include_router(status.router, prefix="/api/v1", tags=["status"])

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "FlakersStudio API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True if os.getenv("ENVIRONMENT") == "development" else False
    )