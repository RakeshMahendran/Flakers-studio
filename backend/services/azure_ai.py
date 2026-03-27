"""
Azure AI Service - Controlled LLM access with governance constraints
"""
import time
from typing import Dict, Any
from openai import AzureOpenAI
import logging

from backend.config.settings import settings
from backend.observability.usage_logging import log_token_usage

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

    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
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
