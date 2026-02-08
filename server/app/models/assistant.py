"""
Assistant model - Core entity for FlakersStudio
"""
from sqlalchemy import Column, String, DateTime, Boolean, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class SourceType(str, enum.Enum):
    """Supported content source types"""
    WEBSITE = "website"
    WORDPRESS = "wordpress"

class AssistantTemplate(str, enum.Enum):
    """Predefined assistant templates"""
    SUPPORT = "support"
    CUSTOMER = "customer" 
    SALES = "sales"
    ECOMMERCE = "ecommerce"

class AssistantStatus(str, enum.Enum):
    """Assistant lifecycle status"""
    CREATING = "creating"
    INGESTING = "ingesting"
    READY = "ready"
    ERROR = "error"
    DISABLED = "disabled"

class Assistant(Base):
    """
    Assistant entity - represents a governance-configured AI assistant
    """
    __tablename__ = "assistants"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Basic Configuration
    name = Column(String(255), nullable=False)
    description = Column(Text)
    source_type = Column(Enum(SourceType), nullable=False)
    site_url = Column(String(500), nullable=False)
    template = Column(Enum(AssistantTemplate), nullable=False)
    
    # Status
    status = Column(Enum(AssistantStatus), default=AssistantStatus.CREATING)
    status_message = Column(Text)
    
    # Governance Configuration
    governance_rules = Column(JSONB, default=dict)  # Serialized governance rules
    allowed_intents = Column(JSONB, default=list)   # List of allowed content intents
    system_prompt = Column(Text)                    # Generated system prompt
    
    # Content Statistics
    total_pages_crawled = Column(String, default="0")
    total_chunks_indexed = Column(String, default="0")
    last_ingestion_at = Column(DateTime(timezone=True))
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    project = relationship("Project", back_populates="assistants")
    content_chunks = relationship("ContentChunk", back_populates="assistant")
    chat_sessions = relationship("ChatSession", back_populates="assistant")
    
    def __repr__(self):
        return f"<Assistant {self.name} ({self.id})>"