"""
Chat API - The critical path for governance-first AI responses
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import time
import logging
import re
import uuid

from backend.api.dependencies import get_current_tenant
from backend.config.logging import log_context
from backend.config.database import get_db
from backend.observability.metrics import observe_chat
from backend.models.assistant import Assistant
from backend.models.project import Project
from backend.models.chat import ChatSession, ChatMessage, ChatDecision
from backend.models.tenant import Tenant
from backend.retrieval.rag_pipeline import RAGPipeline

logger = logging.getLogger(__name__)
router = APIRouter()
rag_pipeline = RAGPipeline()

def _is_small_talk(user_message: str) -> bool:
    """Detect small talk patterns (greetings, thanks, etc.)"""
    if not user_message:
        return False
    text = user_message.strip().lower()
    if not text:
        return False
    if len(text) > 60:
        return False
    patterns = [
        r"^(hi|hey|hello|hellooo+|hii+|heyy+)(\b|!|\.|\?|$)",
        r"^(g+u+)(\b|!|\.|\?|$)",
        r"^(yo+)(\b|!|\.|\?|$)",
        r"^(sup+)(\b|!|\.|\?|$)",
        r"^(good\s*(morning|afternoon|evening|night))(\b|!|\.|\?|$)",
        r"^(how\s*are\s*you)(\b|!|\.|\?|$)",
        r"^(what'?s\s*up)(\b|!|\.|\?|$)",
        r"^(thanks?|thank\s+you|thx)(\b|!|\.|\?|$)",
        r"^(bye|goodbye|see\s+you)(\b|!|\.|\?|$)",
    ]
    return any(re.match(p, text) for p in patterns)

def _validate_and_clean_response(response: str, assistant_name: str) -> str:
    """Validate and clean AI response for quality.
    
    Based on AWS Lambda implementation patterns:
    - Remove repetitive greetings on follow-ups
    - Ensure natural language
    - Remove corporate jargon
    - Validate response length
    """
    if not response:
        return "I apologize, but I couldn't generate a proper response. Please try again."
    
    # Remove excessive whitespace
    response = re.sub(r'\s+', ' ', response).strip()
    
    # Remove repetitive greeting patterns that shouldn't be in follow-ups
    # (This is a simple check - in production, you'd check conversation history)
    repetitive_patterns = [
        r'^Hi there[,!]?\s+',
        r'^Hello[,!]?\s+',
        r"^I'd be happy to\s+",
        r'^As an AI assistant[,]?\s+',
    ]
    for pattern in repetitive_patterns:
        response = re.sub(pattern, '', response, flags=re.IGNORECASE)
    
    # Ensure response isn't too short (likely an error)
    if len(response) < 10:
        return f"I don't have enough information to answer that question about {assistant_name}. Could you please rephrase or ask something else?"
    
    # Ensure response isn't excessively long (over 1000 chars)
    if len(response) > 1000:
        # Truncate at last complete sentence before 1000 chars
        truncated = response[:1000]
        last_period = truncated.rfind('.')
        if last_period > 500:  # Only truncate if we have a reasonable amount
            response = truncated[:last_period + 1]
    
    return response.strip()

class ChatQueryRequest(BaseModel):
    assistant_id: str
    user_message: str
    session_id: Optional[str] = None

class ChatQueryResponse(BaseModel):
    decision: str
    answer: Optional[str] = None
    reason: Optional[str] = None
    sources: List[Dict[str, str]] = []
    rules_applied: List[str] = []
    allowed_scope: List[str] = []
    session_id: str
    processing_time_ms: int

@router.post("/query", response_model=ChatQueryResponse)
async def chat_query(
    request: ChatQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """
    CRITICAL PATH: Process chat query with governance-first approach
    
    This endpoint embodies the core FlakersStudio principle:
    1. Backend authority over all decisions
    2. Governance before AI
    3. Structured responses for UI rendering
    """
    start_time = time.time()
    
    try:
        # 1. Resolve Assistant
        assistant = await _get_assistant(db, request.assistant_id, current_tenant.id)
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
            
        if assistant.status != "ready":
            raise HTTPException(status_code=400, detail=f"Assistant not ready: {assistant.status}")

        with log_context(tenant_id=str(current_tenant.id), assistant_id=str(assistant.id)):
            result = await rag_pipeline.handle_query(
                db=db,
                assistant=assistant,
                user_message=request.user_message,
                session_id=request.session_id,
            )
            observe_chat("chat", str(result.get("decision", "unknown")).lower(), (time.time() - start_time))
            return ChatQueryResponse(**result)
        
    except HTTPException:
        observe_chat("chat", "http_error", (time.time() - start_time))
        raise
    except Exception as e:
        logger.error(f"Chat query error: {str(e)}")
        observe_chat("chat", "error", (time.time() - start_time))
        raise HTTPException(status_code=500, detail="Internal server error")


class ChatHistoryResponse(BaseModel):
    session_id: str
    assistant_id: str
    messages: List[Dict[str, Any]]
    total_messages: int


class ChatThreadsResponse(BaseModel):
    threads: List[Dict[str, Any]]
    total_threads: int


@router.get("/threads", response_model=ChatThreadsResponse)
async def get_chat_threads(
    assistant_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """
    Retrieve conversation threads for an assistant
    
    Parameters:
    - assistant_id: Get all threads for this assistant
    - limit: Maximum number of threads to return (default: 20)
    """
    try:
        # Get all sessions for assistant
        sessions_result = await db.execute(
            select(ChatSession)
            .join(Assistant, Assistant.id == ChatSession.assistant_id)
            .where(ChatSession.assistant_id == assistant_id)
            .where(Assistant.tenant_id == current_tenant.id)
            .order_by(ChatSession.last_activity_at.desc())
            .limit(limit)
        )
        sessions = sessions_result.scalars().all()
        
        threads = []
        for session in sessions:
            # Get message count and last message for each session
            messages_result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at.desc())
            )
            messages = messages_result.scalars().all()
            
            if messages:
                last_message = messages[0]
                # Use user message as preview, or assistant response if no user message
                preview = last_message.user_message or last_message.assistant_response or "New conversation"
                # Truncate preview to 100 chars
                if len(preview) > 100:
                    preview = preview[:100] + "..."
                
                threads.append({
                    "id": str(session.id),
                    "session_id": str(session.id),
                    "last_message": preview,
                    "last_activity": session.last_activity_at.isoformat() if session.last_activity_at else session.created_at.isoformat(),
                    "message_count": len(messages),
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                })
        
        return ChatThreadsResponse(
            threads=threads,
            total_threads=len(threads)
        )
        
    except Exception as e:
        logger.error(f"Error fetching chat threads: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: Optional[str] = None,
    assistant_id: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_tenant: Tenant = Depends(get_current_tenant),
):
    """
    Retrieve conversation history for a session or assistant
    
    Parameters:
    - session_id: Get messages for a specific session
    - assistant_id: Get all messages for an assistant (latest session)
    - limit: Maximum number of messages to return (default: 50)
    """
    try:
        if not session_id and not assistant_id:
            raise HTTPException(
                status_code=400, 
                detail="Either session_id or assistant_id is required"
            )
        
        # Get session
        if session_id:
            session_result = await db.execute(
                select(ChatSession)
                .join(Assistant, Assistant.id == ChatSession.assistant_id)
                .where(ChatSession.id == session_id, Assistant.tenant_id == current_tenant.id)
            )
            session = session_result.scalar_one_or_none()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            # Get latest session for assistant
            session_result = await db.execute(
                select(ChatSession)
                .join(Assistant, Assistant.id == ChatSession.assistant_id)
                .where(ChatSession.assistant_id == assistant_id)
                .where(Assistant.tenant_id == current_tenant.id)
                .order_by(ChatSession.last_activity_at.desc())
                .limit(1)
            )
            session = session_result.scalar_one_or_none()
            if not session:
                # No session exists yet, return empty history
                return ChatHistoryResponse(
                    session_id="",
                    assistant_id=assistant_id,
                    messages=[],
                    total_messages=0
                )
        
        # Get messages for session
        messages_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
        )
        messages = messages_result.scalars().all()
        
        # Format messages for response
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "id": str(msg.id),
                "user_message": msg.user_message,
                "assistant_response": msg.assistant_response,
                "decision": msg.decision,
                "refusal_reason": msg.refusal_reason,
                "sources": msg.sources_used or [],
                "rules_applied": msg.rules_applied or [],
                "processing_time_ms": msg.processing_time_ms,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            })
        
        return ChatHistoryResponse(
            session_id=str(session.id),
            assistant_id=str(session.assistant_id),
            messages=formatted_messages,
            total_messages=len(formatted_messages)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching chat history: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

async def _get_assistant(db: AsyncSession, assistant_id: str, tenant_id: uuid.UUID) -> Optional[Assistant]:
    """Get assistant by ID"""
    result = await db.execute(
        select(Assistant).where(Assistant.id == assistant_id, Assistant.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()

async def _get_or_create_session(
    db: AsyncSession, 
    assistant_id: str, 
    session_id: Optional[str]
) -> ChatSession:
    """Get existing session or create new one"""
    if session_id:
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            return session
    
    # Create new session
    session = ChatSession(
        assistant_id=assistant_id,
        session_token=f"session_{int(time.time())}"
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

async def _log_chat_message(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    decision: ChatDecision,
    assistant_response: Optional[str] = None,
    refusal_reason: Optional[str] = None,
    retrieved_chunks: List[Dict[str, Any]] = None,
    sources_used: List[Dict[str, str]] = None,
    rules_applied: List[str] = None,
    azure_usage: Dict[str, Any] = None,
    processing_time_ms: int = 0
):
    """Log chat message with full governance context"""
    message = ChatMessage(
        session_id=session_id,
        user_message=user_message,
        assistant_response=assistant_response,
        decision=decision.value,
        refusal_reason=refusal_reason.value if refusal_reason else None,
        retrieved_chunks=[chunk.get("id") for chunk in (retrieved_chunks or [])],
        sources_used=sources_used or [],
        rules_applied=rules_applied or [],
        processing_time_ms=str(processing_time_ms),
        azure_prompt_tokens=str(azure_usage.get("prompt_tokens", 0)) if azure_usage else "0",
        azure_completion_tokens=str(azure_usage.get("completion_tokens", 0)) if azure_usage else "0",
        azure_model_used=azure_usage.get("model") if azure_usage else None
    )
    
    db.add(message)
    await db.commit()
