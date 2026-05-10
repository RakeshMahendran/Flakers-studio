"""
Thin retrieval service around the configured vector store.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from backend.vector_providers.base import VectorSearchQuery
from backend.vector_providers.qdrant_provider import get_vector_store


class RetrievalService:
    def __init__(self, vector_store=None):
        self.vector_store = vector_store or get_vector_store()

    async def search_assistant_content(
        self,
        *,
        assistant_id: str,
        query_embedding,
        limit: int,
        score_threshold: float,
        assistant_name: str,
        user_name: str,
        payload_filters: Optional[Dict[str, Any]] = None,
    ):
        return await self.vector_store.search(
            VectorSearchQuery(
                assistant_id=assistant_id,
                query_embedding=query_embedding,
                limit=limit,
                score_threshold=score_threshold,
                assistant_name=assistant_name,
                user_name=user_name,
                payload_filters=payload_filters or {},
            )
        )
