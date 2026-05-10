"""
Embedding Service - Text to vector conversion
"""
from typing import List, Optional
from backend.services.azure_ai import AzureAIService

class EmbeddingService:
    """Service for generating text embeddings"""

    def __init__(self):
        self.azure_service = AzureAIService()

    async def embed_text(self, text: str, tenant_id: Optional[str] = None) -> List[float]:
        """Generate embedding for a single text"""
        embeddings = await self.azure_service.generate_embeddings([text], tenant_id=tenant_id)
        return embeddings[0]

    async def embed_texts(self, texts: List[str], tenant_id: Optional[str] = None) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        return await self.azure_service.generate_embeddings(texts, tenant_id=tenant_id)
