"""
Azure AI Service - Controlled LLM access with governance constraints
"""
from typing import Dict, Any
from openai import AzureOpenAI
import logging

from app.core.config import settings

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
        # Use the correct Azure OpenAI endpoint format
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
        temperature: float = 0.1
    ) -> Dict[str, Any]:
        """
        Generate AI response with governance-approved context
        
        Args:
            system_prompt: Governance-generated prompt with approved context
            user_message: User's question
            max_tokens: Maximum response length
            temperature: Response creativity (low for consistency)
            
        Returns:
            Dict with content and usage information
        """
        try:
            logger.info(f"Calling Azure AI for user message: {user_message[:100]}")
            
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
            
            logger.info(f"Azure AI response generated. Tokens: {response.usage.total_tokens}")
            return result
            
        except Exception as e:
            logger.error(f"Azure AI error: {str(e)}")
            raise Exception(f"AI service error: {str(e)}")
    
    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for text chunks using text-embedding-3-large"""
        try:
            # Handle batch processing for large text lists
            batch_size = 100  # Azure OpenAI batch limit
            all_embeddings = []
            
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                
                response = self.client.embeddings.create(
                    model=self.embedding_deployment,
                    input=batch
                )
                
                batch_embeddings = [data.embedding for data in response.data]
                all_embeddings.extend(batch_embeddings)
            
            logger.info(f"Generated {len(all_embeddings)} embeddings using {self.embedding_deployment}")
            return all_embeddings
            
        except Exception as e:
            logger.error(f"Embedding generation error: {str(e)}")
            raise Exception(f"Embedding service error: {str(e)}")