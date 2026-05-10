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
    DEBUG: bool = False
    
    # API Configuration
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "FlakersStudio"
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    PUBLIC_WIDGET_ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost/flakers_studio"
    
    # Qdrant Vector Database
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: str = ""
    DEFAULT_VECTOR_COLLECTION: str = "flakers_content"
    VECTOR_SIZE: int = 3072
    VECTOR_DISTANCE: str = "cosine"
    
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
    
    # Redis (for caching and Celery task queue)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery task queue (set to False to use old polling worker as fallback)
    USE_CELERY: bool = True
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
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

    @property
    def using_default_secret_key(self) -> bool:
        return self.SECRET_KEY == "your-secret-key-change-in-production"

    def validate_for_production(self) -> None:
        """Raise if critical settings are unsafe for non-development environments."""
        if self.ENVIRONMENT != "development":
            if self.using_default_secret_key:
                raise RuntimeError(
                    "FATAL: SECRET_KEY is still the default value. "
                    "Set a strong SECRET_KEY environment variable before running in production."
                )
            if not self.AZURE_OPENAI_API_KEY:
                raise RuntimeError(
                    "FATAL: AZURE_OPENAI_API_KEY is not set. "
                    "Azure OpenAI credentials are required for non-development environments."
                )
            if self.USE_CELERY and not self.REDIS_URL:
                raise RuntimeError(
                    "FATAL: USE_CELERY is True but REDIS_URL is not set. "
                    "Redis is required when Celery task queue is enabled."
                )

settings = Settings()
settings.validate_for_production()
