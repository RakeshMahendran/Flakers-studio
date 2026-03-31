"""
RAG pipeline extracted from chat routing.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging
import re
import secrets
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.logging import log_context
from backend.models.assistant import Assistant
from backend.models.chat import ChatDecision, ChatMessage, ChatSession
from backend.observability.metrics import observe_vector_search
from backend.models.project import Project
from backend.services.azure_ai import AzureAIService
from backend.services.embeddings import EmbeddingService
from backend.retrieval.retrieval_service import RetrievalService


logger = logging.getLogger(__name__)


class RAGPipeline:
    def __init__(
        self,
        *,
        embedding_service: Optional[EmbeddingService] = None,
        azure_service: Optional[AzureAIService] = None,
        retrieval_service: Optional[RetrievalService] = None,
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.azure_service = azure_service or AzureAIService()
        self.retrieval_service = retrieval_service or RetrievalService()

    async def handle_query(
        self,
        *,
        db: AsyncSession,
        assistant: Assistant,
        user_message: str,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        with log_context(tenant_id=str(assistant.tenant_id), assistant_id=str(assistant.id)):
            start_time = time.time()
            session = await self.get_or_create_session(db, assistant.id, session_id)
            query_embedding = await self.embedding_service.embed_text(user_message)

            project_name = assistant.name
            try:
                project_result = await db.execute(select(Project).where(Project.id == assistant.project_id))
                project = project_result.scalar_one_or_none()
                if project and project.name:
                    project_name = project.name
            except Exception:
                project_name = assistant.name

            user_name = str(assistant.tenant_id)[:8]
            retrieved_chunks = await self.retrieval_service.search_assistant_content(
                assistant_id=str(assistant.id),
                query_embedding=query_embedding,
                limit=10,
                score_threshold=0.55,
                assistant_name=project_name,
                user_name=user_name,
            )

            observe_vector_search(len(retrieved_chunks))
            logger.info("Retrieved %s chunks for assistant %s", len(retrieved_chunks), assistant.id)

            if not retrieved_chunks:
                if self.is_small_talk(user_message):
                    ai_response = await self.azure_service.generate_response(
                        system_prompt="You are a helpful, friendly assistant. Respond naturally and briefly to greetings.",
                        user_message=user_message,
                        temperature=0.6,
                        max_tokens=200,
                    )
                    answer = ai_response["content"]
                else:
                    system_prompt = f"""You are a helpful assistant for {assistant.name}.

The user asked a question but I couldn't find specific information in the knowledge base.

Guidelines:
- If it's a general question about who you are, explain you're an AI assistant for {assistant.name}
- If it's about your capabilities, explain you can help with questions about {assistant.site_url}
- If it's a question that requires specific knowledge, politely say you don't have that information
- Be friendly and conversational
- Keep responses brief and helpful"""
                    ai_response = await self.azure_service.generate_response(
                        system_prompt=system_prompt,
                        user_message=user_message,
                        temperature=0.7,
                        max_tokens=300,
                    )
                    answer = ai_response["content"]

                processing_time_ms = int((time.time() - start_time) * 1000)
                await self.log_chat_message(
                    db=db,
                    session_id=session.id,
                    user_message=user_message,
                    assistant_response=answer,
                    decision=ChatDecision.ANSWER,
                    retrieved_chunks=[],
                    sources_used=[],
                    rules_applied=["No context found - general response"],
                    azure_usage=ai_response.get("usage", {}),
                    processing_time_ms=processing_time_ms,
                )
                return {
                    "decision": "ANSWER",
                    "answer": answer,
                    "sources": [],
                    "rules_applied": ["No context found - general response"],
                    "session_id": str(session.id),
                    "processing_time_ms": processing_time_ms,
                }

            context_text = "\n\n".join(
                [f"Source: {chunk.get('source_url', '')}\nContent: {chunk.get('content', '')}" for chunk in retrieved_chunks]
            )

            conversation_context = ""
            recent_messages = await db.execute(
                select(ChatMessage).where(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.desc()).limit(5)
            )
            messages = recent_messages.scalars().all()
            if messages:
                conversation_context = "\n\nRecent conversation:\n"
                for msg in reversed(messages):
                    role = "User" if msg.user_message else "Assistant"
                    content = msg.user_message or msg.assistant_response or ""
                    conversation_context += f"{role}: {content[:200]}\n"

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
- Reference previous exchanges naturally when relevant
- Maintain conversation continuity and context

Core Behavioral Rules:
1. Sound natural and conversational
2. Prioritize information from the provided context when available
3. Use conversation history to maintain context and provide coherent responses
4. For follow-up questions, provide direct answers without repetitive greetings
5. Do not invent specific details not supported by context
6. When information isn't available, respond naturally
7. Vary your responses
8. Be helpful and suggest alternatives when needed

Off-Topic Query Handling:
- You are ONLY an assistant for {assistant.name}
- If the user asks about topics completely unrelated to {assistant.site_url}, explain that scope clearly.

Retrieved Context:
{context_text}
{conversation_context}

User Query: {user_message}

Provide a helpful, natural response based on the context above."""

            ai_response = await self.azure_service.generate_response(
                system_prompt=system_prompt,
                user_message=user_message,
                temperature=0.3,
                max_tokens=800,
            )
            answer = self.validate_and_clean_response(ai_response["content"], assistant.name)

            sources = []
            seen_urls = set()
            for chunk in retrieved_chunks:
                url = chunk.get("source_url")
                if url and url not in seen_urls:
                    sources.append(
                        {
                            "url": url,
                            "title": chunk.get("source_title", url),
                            "intent": chunk.get("intent", "unknown"),
                        }
                    )
                    seen_urls.add(url)

            processing_time_ms = int((time.time() - start_time) * 1000)
            await self.log_chat_message(
                db=db,
                session_id=session.id,
                user_message=user_message,
                assistant_response=answer,
                decision=ChatDecision.ANSWER,
                retrieved_chunks=retrieved_chunks,
                sources_used=sources,
                rules_applied=[],
                azure_usage=ai_response.get("usage", {}),
                processing_time_ms=processing_time_ms,
            )
            logger.info("Chat response completed with %s sources", len(sources))
            return {
                "decision": "ANSWER",
                "answer": answer,
                "sources": sources,
                "rules_applied": [],
                "session_id": str(session.id),
                "processing_time_ms": processing_time_ms,
            }

    @staticmethod
    async def get_or_create_session(db: AsyncSession, assistant_id: str, session_id: Optional[str]) -> ChatSession:
        if session_id:
            result = await db.execute(select(ChatSession).where(ChatSession.id == session_id))
            session = result.scalar_one_or_none()
            if session:
                return session

        session = ChatSession(assistant_id=assistant_id, session_token=secrets.token_urlsafe(32))
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session

    @staticmethod
    async def log_chat_message(
        *,
        db: AsyncSession,
        session_id: str,
        user_message: str,
        decision: ChatDecision,
        assistant_response: Optional[str] = None,
        refusal_reason: Optional[str] = None,
        retrieved_chunks: Optional[List[Dict[str, Any]]] = None,
        sources_used: Optional[List[Dict[str, str]]] = None,
        rules_applied: Optional[List[str]] = None,
        azure_usage: Optional[Dict[str, Any]] = None,
        processing_time_ms: int = 0,
    ) -> None:
        message = ChatMessage(
            session_id=session_id,
            user_message=user_message,
            assistant_response=assistant_response,
            decision=decision.value,
            refusal_reason=refusal_reason,
            retrieved_chunks=[chunk.get("id") for chunk in (retrieved_chunks or [])],
            sources_used=sources_used or [],
            rules_applied=rules_applied or [],
            processing_time_ms=str(processing_time_ms),
            azure_prompt_tokens=str((azure_usage or {}).get("prompt_tokens", 0)),
            azure_completion_tokens=str((azure_usage or {}).get("completion_tokens", 0)),
            azure_model_used=(azure_usage or {}).get("model"),
        )
        db.add(message)
        await db.commit()

    @staticmethod
    def is_small_talk(user_message: str) -> bool:
        if not user_message:
            return False
        text = user_message.strip().lower()
        if not text or len(text) > 60:
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
        return any(re.match(pattern, text) for pattern in patterns)

    @staticmethod
    def validate_and_clean_response(response: str, assistant_name: str) -> str:
        if not response:
            return "I apologize, but I couldn't generate a proper response. Please try again."

        response = re.sub(r"\s+", " ", response).strip()
        for pattern in [r"^Hi there[,!]?\s+", r"^Hello[,!]?\s+", r"^I'd be happy to\s+", r"^As an AI assistant[,]?\s+"]:
            response = re.sub(pattern, "", response, flags=re.IGNORECASE)

        if len(response) < 10:
            return f"I don't have enough information to answer that question about {assistant_name}. Could you please rephrase or ask something else?"

        if len(response) > 1000:
            truncated = response[:1000]
            last_period = truncated.rfind(".")
            if last_period > 500:
                response = truncated[: last_period + 1]

        return response.strip()
