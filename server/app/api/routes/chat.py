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

from app.core.database import get_db
from app.models.assistant import Assistant
from app.models.project import Project
from app.models.chat import ChatSession, ChatMessage, ChatDecision
from app.services.azure_ai import AzureAIService
from app.services.embeddings import EmbeddingService
from app.core.qdrant_client import search_similar_content

logger = logging.getLogger(__name__)
router = APIRouter()

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
    db: AsyncSession = Depends(get_db)
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
        assistant = await _get_assistant(db, request.assistant_id)
        if not assistant:
            raise HTTPException(status_code=404, detail="Assistant not found")
            
        if assistant.status != "ready":
            raise HTTPException(status_code=400, detail=f"Assistant not ready: {assistant.status}")
        
        # 2. Get or Create Chat Session
        session = await _get_or_create_session(db, assistant.id, request.session_id)
        
        # 3. Generate Query Embedding
        embedding_service = EmbeddingService()
        query_embedding = await embedding_service.embed_text(request.user_message)
        
        # 4. Retrieve Relevant Content from Qdrant using assistant-specific collection
        # Get project name for collection naming
        project_name = assistant.name
        try:
            project_result = await db.execute(
                select(Project).where(Project.id == assistant.project_id)
            )
            project = project_result.scalar_one_or_none()
            if project and project.name:
                project_name = project.name
        except Exception:
            project_name = assistant.name
        
        user_name = str(assistant.tenant_id)[:8]
        
        logger.info(f"Searching for assistant {assistant.id}")
        logger.info(f"Project name: {project_name}")
        logger.info(f"User name: {user_name}")
        logger.info(f"Collection will be: {project_name}_{user_name}")
        
        retrieved_chunks = await search_similar_content(
            assistant_id=str(assistant.id),
            query_embedding=query_embedding,
            limit=10,
            score_threshold=0.55,  # Balanced threshold for better recall
            assistant_name=project_name,
            user_name=user_name
        )
        
        logger.info(f"Retrieved {len(retrieved_chunks)} chunks for query: {request.user_message[:100]}")

        # 5. Build context and generate response with sophisticated prompting
        if not retrieved_chunks:
            # No relevant content found - handle gracefully
            if _is_small_talk(request.user_message):
                # Handle greetings naturally
                azure_service = AzureAIService()
                ai_response = await azure_service.generate_response(
                    system_prompt="You are a helpful, friendly assistant. Respond naturally and briefly to greetings.",
                    user_message=request.user_message,
                    temperature=0.6,
                    max_tokens=200
                )
                answer = ai_response["content"]
            else:
                # For general questions without context, still try to help
                azure_service = AzureAIService()
                system_prompt = f"""You are a helpful assistant for {assistant.name}.

The user asked a question but I couldn't find specific information in the knowledge base.

Guidelines:
- If it's a general question about who you are, explain you're an AI assistant for {assistant.name}
- If it's about your capabilities, explain you can help with questions about {assistant.site_url}
- If it's a question that requires specific knowledge, politely say you don't have that information
- Be friendly and conversational
- Keep responses brief and helpful"""
                
                ai_response = await azure_service.generate_response(
                    system_prompt=system_prompt,
                    user_message=request.user_message,
                    temperature=0.7,
                    max_tokens=300
                )
                answer = ai_response["content"]
            
            await _log_chat_message(
                db=db,
                session_id=session.id,
                user_message=request.user_message,
                assistant_response=answer,
                decision=ChatDecision.ANSWER,
                retrieved_chunks=[],
                sources_used=[],
                rules_applied=["No context found - general response"],
                azure_usage=ai_response.get("usage", {}),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )
            return ChatQueryResponse(
                decision="ANSWER",
                answer=answer,
                sources=[],
                rules_applied=["No context found - general response"],
                session_id=str(session.id),
                processing_time_ms=int((time.time() - start_time) * 1000)
            )

        # Build context from retrieved chunks
        context_text = "\n\n".join([
            f"Source: {chunk.get('source_url', '')}\nContent: {chunk.get('content', '')}"
            for chunk in retrieved_chunks
        ])
        
        # Build conversation history context
        conversation_context = ""
        if session and session.id:
            # Get recent messages for context
            recent_messages = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at.desc())
                .limit(5)
            )
            messages = recent_messages.scalars().all()
            if messages:
                conversation_context = "\n\nRecent conversation:\n"
                for msg in reversed(messages):
                    role = "User" if msg.user_message else "Assistant"
                    content = msg.user_message or msg.assistant_response or ""
                    conversation_context += f"{role}: {content[:200]}\n"
        
        # Use sophisticated RAG prompt inspired by AWS Lambda implementation
        system_prompt = f"""You are an AI assistant for {assistant.name}.

Voice & Style:
- Sound like a helpful, knowledgeable colleague - warm, genuine, and conversational
- Use natural, human language with contractions (e.g., "I'm", "we're", "you'll")
- Avoid corporate jargon and overly formal phrases
- Keep it conversational and helpful, like talking to a friend

Conversation History Awareness - CRITICAL:
- You have access to the conversation history below
- If there's conversation history, this is a FOLLOW-UP question - don't greet again
- For follow-up questions, provide direct answers without introductory pleasantries
- Reference previous exchanges naturally when relevant (e.g., "As I mentioned...", "Following up on...")
- Maintain conversation continuity and context

Response Style Based on Context:
- FIRST MESSAGE (no conversation history): Introduce yourself briefly, then answer
- FOLLOW-UP QUESTIONS (conversation history exists): Jump straight to the answer
  * BAD: "Hi there, I'd be happy to provide you with..."
  * GOOD: "Our services include..."
  * GOOD: "You can find that information at..."

Core Behavioral Rules:
1. Sound natural and conversational - like a knowledgeable colleague, not a corporate bot
2. Prioritize information from the provided context when available
3. Use conversation history to maintain context and provide coherent responses
4. For follow-up questions, provide DIRECT answers without repetitive greetings
5. Do not invent specific details not supported by context
6. When information isn't available, respond naturally: "I don't have that specific information available"
7. Vary your responses - don't use the same phrases repeatedly
8. Be helpful: suggest where they might find info or what you CAN help with instead

Off-Topic Query Handling:
- You are ONLY an assistant for {assistant.name}
- If the user asks about topics completely unrelated to {assistant.site_url}, respond with:
  "I'm an assistant for {assistant.name}. I don't have information about [topic]. Is there anything about {assistant.name} I can help you with?"

Retrieved Context:
{context_text}
{conversation_context}

User Query: {request.user_message}

Provide a helpful, natural response based on the context above."""

        azure_service = AzureAIService()
        ai_response = await azure_service.generate_response(
            system_prompt=system_prompt,
            user_message=request.user_message,
            temperature=0.3,  # Lower temperature for more focused responses
            max_tokens=800
        )
        
        # Validate and clean response
        answer = _validate_and_clean_response(ai_response["content"], assistant.name)

        sources = []
        seen_urls = set()
        for chunk in retrieved_chunks:
            url = chunk.get("source_url")
            if url and url not in seen_urls:
                sources.append({
                    "url": url,
                    "title": chunk.get("source_title", url),
                    "intent": chunk.get("intent", "unknown")
                })
                seen_urls.add(url)
        
        # 6. Log Successful Response
        await _log_chat_message(
            db=db,
            session_id=session.id,
            user_message=request.user_message,
            assistant_response=ai_response["content"],
            decision=ChatDecision.ANSWER,
            retrieved_chunks=retrieved_chunks,
            sources_used=sources,
            rules_applied=[],
            azure_usage=ai_response.get("usage", {}),
            processing_time_ms=int((time.time() - start_time) * 1000)
        )
        
        return ChatQueryResponse(
            decision="ANSWER",
            answer=ai_response["content"],
            sources=sources,
            rules_applied=[],
            session_id=str(session.id),
            processing_time_ms=int((time.time() - start_time) * 1000)
        )
        
    except Exception as e:
        logger.error(f"Chat query error: {str(e)}")
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
    db: AsyncSession = Depends(get_db)
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
            .where(ChatSession.assistant_id == assistant_id)
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
    db: AsyncSession = Depends(get_db)
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
                select(ChatSession).where(ChatSession.id == session_id)
            )
            session = session_result.scalar_one_or_none()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            # Get latest session for assistant
            session_result = await db.execute(
                select(ChatSession)
                .where(ChatSession.assistant_id == assistant_id)
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

async def _get_assistant(db: AsyncSession, assistant_id: str) -> Optional[Assistant]:
    """Get assistant by ID"""
    result = await db.execute(
        select(Assistant).where(Assistant.id == assistant_id)
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