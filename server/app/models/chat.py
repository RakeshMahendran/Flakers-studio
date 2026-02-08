"""
Chat models - Represents chat sessions and governance decisions
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class ChatDecision(str, enum.Enum):
    """Governance decision types"""
    ANSWER = "ANSWER"
    REFUSE = "REFUSE"

class RefusalReason(str, enum.Enum):
    """Reasons for refusing to answer"""
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    NO_CONTEXT = "NO_CONTEXT"
    POLICY_VIOLATION = "POLICY_VIOLATION"
    CROSS_TENANT = "CROSS_TENANT"
    INSUFFICIENT_CONFIDENCE = "INSUFFICIENT_CONFIDENCE"

class ChatSession(Base):
    """
    Represents a chat session with an assistant
    """
    __tablename__ = "chat_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assistant_id = Column(UUID(as_uuid=True), ForeignKey("assistants.id"), nullable=False)
    
    # Session Info
    session_token = Column(String(255), unique=True, index=True)
    user_identifier = Column(String(255))  # Optional user tracking
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    assistant = relationship("Assistant", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session")
    
    def __repr__(self):
        return f"<ChatSession {self.id}>"

class ChatMessage(Base):
    """
    Represents individual messages and governance decisions
    """
    __tablename__ = "chat_messages"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id"), nullable=False)
    
    # Message Content
    user_message = Column(Text, nullable=False)
    assistant_response = Column(Text)
    
    # Governance Decision
    decision = Column(String(20), nullable=False)  # ANSWER or REFUSE
    refusal_reason = Column(String(50))  # If decision is REFUSE
    
    # Context and Sources
    retrieved_chunks = Column(JSONB, default=list)  # List of chunk IDs used
    sources_used = Column(JSONB, default=list)      # Source URLs and metadata
    rules_applied = Column(JSONB, default=list)     # Governance rules that were applied
    
    # Processing Metadata
    retrieval_query = Column(Text)  # Processed query sent to Qdrant
    confidence_score = Column(String)  # Overall confidence in response
    processing_time_ms = Column(String)
    
    # Azure AI Usage
    azure_prompt_tokens = Column(String, default="0")
    azure_completion_tokens = Column(String, default="0")
    azure_model_used = Column(String(100))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    
    def __repr__(self):
        return f"<ChatMessage {self.id} - {self.decision}>"