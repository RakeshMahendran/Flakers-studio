"""
Project model - Multi-tenant project management with lifecycle tracking
"""
from sqlalchemy import Column, String, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class ProjectStatus(str, enum.Enum):
    """Project lifecycle status"""
    ACTIVE = "active"
    DELETING = "deleting"
    DELETED = "deleted"

class Project(Base):
    """
    Project entity - top-level container for assistants and content
    Multi-tenant safe with lifecycle management
    """
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    
    # Basic Information
    name = Column(String(255), nullable=False)
    description = Column(String(1000))
    
    # Status
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.ACTIVE, nullable=False, index=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True))
    
    # Relationships
    assistants = relationship("Assistant", back_populates="project")
    ingestion_jobs = relationship("IngestionJob", back_populates="project")
    
    def __repr__(self):
        return f"<Project {self.name} ({self.id}) - {self.status.value}>"
