"""
Ingestion tracking models - URL and chunk-level state management
Supports resumable, multi-stage ingestion pipeline
"""
from sqlalchemy import Column, String, DateTime, Integer, Float, Boolean, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class JobStatus(str, enum.Enum):
    """Job lifecycle status"""
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"

class URLStatus(str, enum.Enum):
    """URL processing status"""
    DISCOVERED = "discovered"
    SCRAPING = "scraping"
    SCRAPED = "scraped"
    FAILED_SCRAPING = "failed_scraping"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED_PROCESSING = "failed_processing"
    INGESTING = "ingesting"
    COMPLETED = "completed"
    PARTIAL = "partial"  # Some chunks uploaded, some failed
    FAILED = "failed"

class ChunkStatus(str, enum.Enum):
    """Chunk upload status"""
    QUEUED = "queued"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    FAILED = "failed"
    RETRYING = "retrying"

class IngestionURL(Base):
    """
    Tracks individual URL processing through the pipeline
    """
    __tablename__ = "ingestion_urls"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # URL Information
    url = Column(String(2000), nullable=False)
    url_hash = Column(String(64), nullable=False, index=True)  # For deduplication
    
    # Status
    status = Column(String(50), nullable=False, default=URLStatus.DISCOVERED.value, index=True)
    
    # Scraping Results
    title = Column(String(500))
    content_type = Column(String(50))
    language = Column(String(10))  # ISO language code (en, es, fr, etc.)
    word_count = Column(Integer)
    raw_content = Column(Text)  # Store raw scraped content
    content_length = Column(Integer)
    
    # Processing Results
    token_count = Column(Integer)
    chunk_count = Column(Integer)  # Known only after processing
    
    # Metadata
    scraped_at = Column(DateTime(timezone=True))
    processed_at = Column(DateTime(timezone=True))
    
    # Error Tracking
    failure_reason = Column(Text)
    retry_count = Column(Integer, default=0)
    is_retryable = Column(Boolean, default=True)  # Whether failure can be retried
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    job = relationship("IngestionJob", back_populates="urls")
    chunks = relationship("IngestionChunk", back_populates="url", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('idx_url_job_status', 'job_id', 'status'),
        Index('idx_job_url_hash', 'job_id', 'url_hash'),
    )
    
    def __repr__(self):
        return f"<IngestionURL {self.url} - {self.status}>"

class IngestionChunk(Base):
    """
    Tracks individual chunk upload status
    Supports partial ingestion and retry logic
    """
    __tablename__ = "ingestion_chunks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_urls.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Chunk Identification
    chunk_id = Column(String(100), nullable=False, unique=True, index=True)  # Deterministic ID
    chunk_index = Column(Integer, nullable=False)
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    
    # Status
    status = Column(String(50), nullable=False, default=ChunkStatus.QUEUED.value, index=True)
    
    # Vector DB Reference
    qdrant_point_id = Column(String(100), unique=True)  # Set after successful upload
    
    # Metadata
    intent = Column(String(50))
    confidence_score = Column(Float)
    chunk_size = Column(Integer)
    
    # Error Tracking
    failure_reason = Column(Text)
    retry_count = Column(Integer, default=0)
    is_retryable = Column(Boolean, default=True)  # Whether failure can be retried
    last_retry_at = Column(DateTime(timezone=True))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    uploaded_at = Column(DateTime(timezone=True))
    
    # Relationships
    url = relationship("IngestionURL", back_populates="chunks")
    job = relationship("IngestionJob")
    
    __table_args__ = (
        Index('idx_chunk_job_status', 'job_id', 'status'),
        Index('idx_url_status', 'url_id', 'status'),
        Index('idx_chunk_id', 'chunk_id'),
    )
    
    def __repr__(self):
        return f"<IngestionChunk {self.chunk_id} - {self.status}>"
