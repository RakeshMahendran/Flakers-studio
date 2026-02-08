"""
Core configuration for FlakersStudio
"""
from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    """Application settings"""
    
    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "FlakersStudio"
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost/flakers_studio"
    
    # Qdrant Vector Database
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""
    
    # Azure AI
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"
    AZURE_OPENAI_DEPLOYMENT_NAME: str = "gpt-4"
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str = "text-embedding-ada-002"
    
    # Azure AI Studio Additional Config
    AZURE_AI_STUDIO_ENDPOINT: str = ""
    AZURE_SUBSCRIPTION_ID: str = ""
    AZURE_LOCATION: str = ""
    
    # Redis (Optional - for caching and background jobs)
    # REDIS_URL: str = "redis://localhost:6379"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Content Processing
    MAX_CONTENT_LENGTH: int = 10000  # characters per chunk
    CHUNK_OVERLAP: int = 200
    MAX_CRAWL_PAGES: int = 1000
    
    # Governance Rules
    ENABLE_STRICT_GOVERNANCE: bool = True
    REQUIRE_SOURCE_ATTRIBUTION: bool = True
    ALLOW_CROSS_TENANT_ACCESS: bool = False
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()