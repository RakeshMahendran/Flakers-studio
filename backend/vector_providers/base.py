"""
Vector provider abstractions.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol


@dataclass
class VectorSearchQuery:
    assistant_id: str
    query_embedding: List[float]
    limit: int = 10
    score_threshold: float = 0.7
    assistant_name: Optional[str] = None
    user_name: Optional[str] = None


@dataclass
class VectorRecord:
    content: str
    source_url: str
    source_title: str = ""
    source_type: str = "general"
    intent: str = "unknown"
    confidence_score: float = 0.0
    requires_attribution: bool = True
    is_policy_content: bool = False
    is_sensitive: bool = False
    chunk_index: int = 0
    content_hash: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class VectorStore(Protocol):
    async def initialize(self) -> None:
        ...

    async def ensure_collection(self, assistant_name: Optional[str] = None, user_name: Optional[str] = None) -> str:
        ...

    async def upsert(
        self,
        assistant_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        assistant_name: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> List[str]:
        ...

    async def search(self, query: VectorSearchQuery) -> List[Dict[str, Any]]:
        ...

    async def delete_assistant_content(
        self,
        assistant_id: str,
        assistant_name: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> None:
        ...

    async def delete_collection(self, assistant_name: str, user_name: str) -> None:
        ...
