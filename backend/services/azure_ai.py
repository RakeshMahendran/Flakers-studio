"""
Azure AI Service - Controlled LLM access with governance constraints
"""
import time
from typing import Dict, Any
from openai import AzureOpenAI
import logging

from backend.config.settings import settings
from backend.observability.usage_logging import log_token_usage
from backend.cache.decorators import cached_embedding, cached_answer

logger = logging.getLogger(__name__)

class AzureAIService:
    """
    Azure AI service with strict governance controls

    This service ensures:
    - AI is only called AFTER governance approval
    - System prompts contain only approved context
    - Responses are logged for audit
    """

    def __init__(self):
        self.client = AzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT
        )
        self.deployment_name = settings.AZURE_OPENAI_DEPLOYMENT_NAME
        self.embedding_deployment = settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
        # Cheap deployment used for non-customer-facing utility calls
        # (filter extraction, query rewriting, etc.). Falls back to the
        # main deployment if the cheap one isn't configured.
        self.filter_extraction_model = (
            getattr(settings, "FILTER_EXTRACTION_MODEL", "")
            or self.deployment_name
        )

    async def generate_response(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1000,
        temperature: float = 0.1,
        tenant_id: str | None = None,
        assistant_id: str | None = None,
    ) -> Dict[str, Any]:
        """
        Generate AI response with governance-approved context

        Args:
            system_prompt: Governance-generated prompt with approved context
            user_message: User's question
            max_tokens: Maximum response length
            temperature: Response creativity (low for consistency)
            tenant_id: Optional tenant ID for usage tracking
            assistant_id: Optional assistant ID for usage tracking

        Returns:
            Dict with content and usage information
        """
        try:
            logger.info(f"Calling Azure AI for user message: {user_message[:100]}")

            t0 = time.perf_counter()
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=0.9,
                frequency_penalty=0,
                presence_penalty=0
            )
            latency_ms = (time.perf_counter() - t0) * 1000

            result = {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                    "model": self.deployment_name
                },
                "finish_reason": response.choices[0].finish_reason
            }

            # Track token usage for monitoring & cost estimation
            log_token_usage(
                tenant_id=tenant_id,
                assistant_id=assistant_id,
                task_type="chat_completion",
                model=self.deployment_name,
                vendor="azure_openai",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                latency_ms=round(latency_ms, 1),
                metadata={"component": "azure_ai.generate_response"},
            )

            logger.info(f"Azure AI response generated. Tokens: {response.usage.total_tokens}")
            return result

        except Exception as e:
            logger.error(f"Azure AI error: {str(e)}")
            raise Exception(f"AI service error: {str(e)}")

    async def extract_filters(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 300,
        temperature: float = 0.0,
        tenant_id: str | None = None,
        assistant_id: str | None = None,
    ) -> Dict[str, Any]:
        """Cheap deployment call for query-filter extraction.

        This is a separate code path from ``generate_response`` so the
        filter-extraction model can be swapped (e.g. ``gpt-4o-mini``)
        without touching customer-facing answer synthesis.

        Returns the same shape as ``generate_response``: ``content`` plus
        a ``usage`` dict. Errors are caught and surfaced as an empty
        ``content`` so the caller can degrade gracefully to semantic-only
        retrieval.
        """
        try:
            t0 = time.perf_counter()
            response = self.client.chat.completions.create(
                model=self.filter_extraction_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=0.9,
            )
            latency_ms = (time.perf_counter() - t0) * 1000

            content = response.choices[0].message.content or ""
            result = {
                "content": content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                    "model": self.filter_extraction_model,
                },
                "finish_reason": response.choices[0].finish_reason,
            }

            log_token_usage(
                tenant_id=tenant_id,
                assistant_id=assistant_id,
                task_type="filter_extraction",
                model=self.filter_extraction_model,
                vendor="azure_openai",
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
                latency_ms=round(latency_ms, 1),
                metadata={"component": "azure_ai.extract_filters"},
            )

            logger.info(
                "Filter-extraction call ok: tokens=%s latency_ms=%.1f model=%s",
                response.usage.total_tokens,
                latency_ms,
                self.filter_extraction_model,
            )
            return result

        except Exception as e:  # noqa: BLE001 — degrade gracefully
            logger.warning(
                "Filter extraction call failed (degrading to semantic-only): %s",
                e,
                exc_info=True,  # Include stack trace for debugging
                extra={
                    "tenant_id": tenant_id,
                    "assistant_id": assistant_id,
                    "model": self.filter_extraction_model,
                }
            )
            # Return empty content to trigger fallback; include error for debugging
            return {
                "content": "",
                "usage": {},
                "finish_reason": "error",
                "error": str(e),
                "error_type": type(e).__name__,
            }

    @cached_embedding()
    async def generate_embeddings(
        self, texts: list[str], tenant_id: str | None = None
    ) -> list[list[float]]:
        """Generate embeddings for text chunks using text-embedding-3-large"""
        try:
            batch_size = 100
            all_embeddings = []
            total_tokens = 0

            t0 = time.perf_counter()
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]

                response = self.client.embeddings.create(
                    model=self.embedding_deployment,
                    input=batch
                )

                batch_embeddings = [data.embedding for data in response.data]
                all_embeddings.extend(batch_embeddings)
                total_tokens += response.usage.total_tokens

            latency_ms = (time.perf_counter() - t0) * 1000

            # Track embedding token usage
            log_token_usage(
                task_type="embedding",
                model=self.embedding_deployment,
                vendor="azure_openai",
                input_tokens=total_tokens,
                output_tokens=0,
                total_tokens=total_tokens,
                latency_ms=round(latency_ms, 1),
                metadata={
                    "component": "azure_ai.generate_embeddings",
                    "text_count": len(texts),
                },
            )

            logger.info(f"Generated {len(all_embeddings)} embeddings using {self.embedding_deployment}")
            return all_embeddings

        except Exception as e:
            logger.error(f"Embedding generation error: {str(e)}")
            raise Exception(f"Embedding service error: {str(e)}")

    @cached_answer()
    async def generate_response_cached(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 1000,
        temperature: float = 0.1,
        tenant_id: str | None = None,
        assistant_id: str | None = None,
        retrieved_chunks: list | None = None,
        used_fallback: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate AI response with caching support.

        This is a wrapper around generate_response that adds caching support
        for the RAG pipeline. The cache is keyed by (tenant_id, assistant_id,
        user_message, chunk_hashes, content_version).

        Args:
            system_prompt: Governance-generated prompt with approved context
            user_message: User's question
            max_tokens: Maximum response length
            temperature: Response creativity (low for consistency)
            tenant_id: Tenant ID for cache isolation
            assistant_id: Assistant ID for cache key
            retrieved_chunks: List of chunks used for context (for cache key)
            used_fallback: If True, response will NOT be cached

        Returns:
            Dict with content and usage information

        Note:
            The @cached_answer decorator intercepts this method and:
            - Skips caching if used_fallback=True
            - Uses retrieved_chunks to create a stable cache key
            - Ensures tenant isolation via tenant_id in cache key
        """
        # Call the non-cached generate_response method
        return await self.generate_response(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens,
            temperature=temperature,
            tenant_id=tenant_id,
            assistant_id=assistant_id,
        )
