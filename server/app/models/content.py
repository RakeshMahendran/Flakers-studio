"""
Content models - Represents ingested and processed content
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class ContentIntent(str, enum.Enum):
    """Content classification by intent"""
    DOCUMENTATION = "documentation"
    SUPPORT = "support"
    PRODUCT_INFO = "product_info"
    PRICING = "pricing"
    POLICY = "policy"
    LEGAL = "legal"
    MARKETING = "marketing"
    BLOG = "blog"
    FAQ = "faq"
    TUTORIAL = "tutorial"
    UNKNOWN = "unknown"

class ContentChunk(Base):
    """
    Represents a processed chunk of content with embeddings
    """
    __tablename__ = "content_chunks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assistant_id = Column(UUID(as_uuid=True), ForeignKey("assistants.id"), nullable=False)
    
    # Source Information
    source_url = Column(String(1000), nullable=False)
    source_title = Column(String(500))
    source_type = Column(String(50))  # page, post, product, etc.
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)  # For deduplication
    
    # Classification
    intent = Column(String(50), nullable=False, index=True)
    confidence_score = Column(Float, default=0.0)  # Intent classification confidence
    
    # Vector Information (stored in Qdrant, referenced here)
    qdrant_point_id = Column(String(100), nullable=False, unique=True)
    embedding_model = Column(String(100), default="text-embedding-ada-002")
    
    # Processing Metadata
    chunk_index = Column(Integer, default=0)  # Order within source document
    chunk_size = Column(Integer)
    
    # Governance Flags
    requires_attribution = Column(Boolean, default=True)
    is_policy_content = Column(Boolean, default=False)
    is_sensitive = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships - using string reference to avoid circular imports
    assistant = relationship("Assistant", back_populates="content_chunks")
    
    def __repr__(self):
        return f"<ContentChunk {self.id} from {self.source_url}>"

class JobStatus(str, enum.Enum):
    """Job lifecycle status - matches pipeline spec"""
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"

class IngestionJob(Base):
    """
    Tracks content ingestion progress with multi-stage pipeline support
    Supports cooperative cancellation and resumability
    """
    __tablename__ = "ingestion_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    assistant_id = Column(UUID(as_uuid=True), ForeignKey("assistants.id"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Job Status
    status = Column(String(50), default=JobStatus.QUEUED.value, nullable=False, index=True)
    current_stage = Column(String(50))  # discovery, scraping, processing, ingestion
    
    # Discovery Phase (completed first)
    total_urls_discovered = Column(Integer, default=0)  # Fixed, immutable after discovery
    
    # URL-level Progress (truthful counts)
    urls_scraped = Column(Integer, default=0)
    urls_failed_scraping = Column(Integer, default=0)
    urls_processed = Column(Integer, default=0)
    urls_failed_processing = Column(Integer, default=0)
    urls_completed = Column(Integer, default=0)
    urls_partial = Column(Integer, default=0)
    urls_failed = Column(Integer, default=0)
    
    # Chunk-level Progress (known only after processing)
    total_chunks_created = Column(Integer)  # NULL until all URLs processed
    chunks_uploaded = Column(Integer, default=0)
    chunks_failed = Column(Integer, default=0)
    chunks_retrying = Column(Integer, default=0)
    
    # Error Tracking
    errors_count = Column(Integer, default=0)
    error_details = Column(JSONB, default=list)
    
    # Cancellation Support
    cancellation_requested = Column(Boolean, default=False, index=True)
    cancellation_reason = Column(String(500))
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    cancelled_at = Column(DateTime(timezone=True))
    
    # Relationships
    project = relationship("Project", back_populates="ingestion_jobs")
    urls = relationship("IngestionURL", back_populates="job", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<IngestionJob {self.id} - {self.status} - {self.current_stage}>"
    
    def should_cancel(self) -> bool:
        """Check if job should be cancelled"""
        return self.cancellation_requested or self.status == JobStatus.CANCELLED.value