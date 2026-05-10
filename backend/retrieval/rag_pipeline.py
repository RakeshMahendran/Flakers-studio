"""
RAG pipeline extracted from chat routing.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional
import logging
import re
import secrets
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config.logging import log_context
from backend.config.settings import settings
from backend.models.assistant import Assistant
from backend.models.chat import ChatDecision, ChatMessage, ChatSession
from backend.observability.metrics import observe_vector_search
from backend.models.project import Project
from backend.services.azure_ai import AzureAIService
from backend.services.embeddings import EmbeddingService
from backend.retrieval.retrieval_service import RetrievalService
from backend.retrieval.fast_intent import FastIntentResult, detect_fast_intent
from backend.retrieval.filter_extractor import FilterExtractor, FilterResult
from backend.retrieval.prompt_builder import (
    detect_response_mode,
    get_synthesis_system_prompt,
)


logger = logging.getLogger(__name__)


class RAGPipeline:
    def __init__(
        self,
        *,
        embedding_service: Optional[EmbeddingService] = None,
        azure_service: Optional[AzureAIService] = None,
        retrieval_service: Optional[RetrievalService] = None,
        filter_extractor: Optional[FilterExtractor] = None,
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.azure_service = azure_service or AzureAIService()
        self.retrieval_service = retrieval_service or RetrievalService()
        # Filter extractor is opt-out via ``settings.ENABLE_FILTER_EXTRACTION``
        # (the extractor itself short-circuits on the flag, but we still
        # build it lazily so unit tests can swap in a stub).
        self.filter_extractor = filter_extractor or FilterExtractor(
            azure_service=self.azure_service
        )

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

            # Fast-path: trivial conversational turns (greetings, thanks,
            # goodbyes, and context-gated yes/no). Runs BEFORE embeddings,
            # retrieval, or the synthesis LLM call so it costs ~1ms and
            # zero Azure tokens. See backend/retrieval/fast_intent.py.
            last_bot_message = await self._fetch_last_bot_message(db, session.id)
            fast_hit = detect_fast_intent(
                user_message,
                assistant_name=assistant.name,
                last_bot_message=last_bot_message,
            )
            if fast_hit is not None:
                return await self._respond_fast_intent(
                    db=db,
                    session=session,
                    user_message=user_message,
                    fast_hit=fast_hit,
                    start_time=start_time,
                )

            # Run embedding + LLM-based filter extraction in PARALLEL.
            # Total added latency is max(embed_time, filter_time), not their
            # sum. ``return_exceptions=True`` keeps a filter-extraction
            # failure from killing the whole request — we degrade to
            # semantic-only retrieval instead.
            embed_coro = self.embedding_service.embed_text(user_message)
            filter_coro = self._run_filter_extraction(
                user_message=user_message,
                assistant=assistant,
            )
            embed_result, filter_outcome = await asyncio.gather(
                embed_coro, filter_coro, return_exceptions=True
            )

            if isinstance(embed_result, Exception):
                # Embedding is required — propagate.
                logger.error(
                    "Embedding generation failed: %s",
                    embed_result,
                    exc_info=embed_result
                )
                raise embed_result
            query_embedding = embed_result

            if isinstance(filter_outcome, Exception):
                logger.warning(
                    "Filter extraction raised; falling back to semantic-only: %s",
                    filter_outcome,
                    exc_info=filter_outcome
                )
                filter_result = FilterResult()
            elif filter_outcome is None:
                # Defensive: extract() should always return FilterResult, but guard against bugs
                logger.warning(
                    "Filter extraction returned None (this should not happen), falling back to semantic-only"
                )
                filter_result = FilterResult()
            else:
                filter_result = filter_outcome

            project_name = assistant.name
            try:
                project_result = await db.execute(select(Project).where(Project.id == assistant.project_id))
                project = project_result.scalar_one_or_none()
                if project and project.name:
                    project_name = project.name
            except Exception:
                project_name = assistant.name

            user_name = str(assistant.tenant_id)[:8]

            payload_filters = dict(filter_result.filters) if filter_result.filters else {}
            used_fallback = False

            retrieved_chunks = await self.retrieval_service.search_assistant_content(
                assistant_id=str(assistant.id),
                query_embedding=query_embedding,
                limit=10,
                score_threshold=0.55,
                assistant_name=project_name,
                user_name=user_name,
                payload_filters=payload_filters,
            )

            # Fallback: if a filtered search returned nothing, retry once
            # with no payload filter (semantic-only) and tag the response.
            if payload_filters and not retrieved_chunks:
                logger.info(
                    "Filtered search empty (filters=%s); retrying semantic-only",
                    sorted(payload_filters.keys()),
                )
                used_fallback = True
                retrieved_chunks = await self.retrieval_service.search_assistant_content(
                    assistant_id=str(assistant.id),
                    query_embedding=query_embedding,
                    limit=10,
                    score_threshold=0.55,
                    assistant_name=project_name,
                    user_name=user_name,
                    payload_filters={},
                )

                if not retrieved_chunks:
                    # Fallback also returned nothing — likely no content in DB
                    logger.warning(
                        "Fallback semantic search also returned 0 results (assistant_id=%s). "
                        "This suggests no content indexed or score_threshold too high.",
                        assistant.id
                    )
                else:
                    logger.info(
                        "Fallback succeeded: retrieved %d chunks without filters",
                        len(retrieved_chunks)
                    )

            observe_vector_search(len(retrieved_chunks))
            logger.info(
                "Retrieved %s chunks for assistant %s (filters=%s used_fallback=%s)",
                len(retrieved_chunks),
                assistant.id,
                sorted(payload_filters.keys()) if payload_filters else [],
                used_fallback,
            )

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
                    "used_fallback": used_fallback,
                    "applied_filters": sorted(payload_filters.keys()) if payload_filters else [],
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

            response_mode = detect_response_mode(user_message)
            base_system_prompt = get_synthesis_system_prompt(
                assistant_name=assistant.name,
                mode=response_mode,
            )
            system_prompt = (
                f"{base_system_prompt}\n\n"
                f"Retrieved Context:\n{context_text}"
                f"{conversation_context}"
            )

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
                "used_fallback": used_fallback,
                "applied_filters": sorted(payload_filters.keys()) if payload_filters else [],
            }

    async def _run_filter_extraction(
        self,
        *,
        user_message: str,
        assistant: Assistant,
    ) -> FilterResult:
        """Wrap ``FilterExtractor.extract`` so it's safe inside ``asyncio.gather``.

        The extractor itself short-circuits on the off-switch and on
        invalid JSON, returning an empty ``FilterResult`` rather than
        raising. This wrapper exists so the gather call has a single
        coroutine type to await, and so we can apply a per-call timeout
        without leaking it into the public extractor API.
        """
        if not getattr(settings, "ENABLE_FILTER_EXTRACTION", True):
            return FilterResult()
        timeout = float(getattr(settings, "FILTER_EXTRACTION_TIMEOUT_SECONDS", 4.0))
        try:
            return await asyncio.wait_for(
                self.filter_extractor.extract(
                    query=user_message,
                    tenant_id=str(getattr(assistant, "tenant_id", "")) or None,
                    assistant_id=str(getattr(assistant, "id", "")) or None,
                ),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Filter extraction timed out after %.2fs; falling back to semantic-only",
                timeout,
            )
            return FilterResult()
        except Exception as e:  # noqa: BLE001 — extractor must never break the request
            logger.warning("Filter extraction errored: %s", e)
            return FilterResult()

    @staticmethod
    async def _fetch_last_bot_message(db: AsyncSession, session_id: Any) -> Optional[str]:
        """Return the most recent assistant turn for this session, if any.

        Used to gate fast-path affirmation/negation matches: a bare
        "yes" or "no" is only meaningful when the previous bot message
        was a question.
        """
        try:
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
            last = result.scalar_one_or_none()
        except Exception:
            return None
        if last is None:
            return None
        return last.assistant_response

    async def _respond_fast_intent(
        self,
        *,
        db: AsyncSession,
        session: ChatSession,
        user_message: str,
        fast_hit: FastIntentResult,
        start_time: float,
    ) -> Dict[str, Any]:
        """Log and return a fast-path response shaped like a normal answer."""
        processing_time_ms = int((time.time() - start_time) * 1000)
        await self.log_chat_message(
            db=db,
            session_id=session.id,
            user_message=user_message,
            assistant_response=fast_hit.canned_response,
            decision=ChatDecision.ANSWER,
            retrieved_chunks=[],
            sources_used=[],
            rules_applied=["fast_intent"],
            azure_usage={},
            processing_time_ms=processing_time_ms,
        )
        logger.info(
            "Fast-intent short-circuit: intent=%s session=%s",
            fast_hit.intent,
            session.id,
        )
        return {
            "decision": "ANSWER",
            "answer": fast_hit.canned_response,
            "sources": [],
            "rules_applied": ["fast_intent"],
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
