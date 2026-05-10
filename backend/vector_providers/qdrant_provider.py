"""
Qdrant vector database client and adapter.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PayloadSchemaType, PointStruct, VectorParams

from backend.config.settings import settings
from backend.vector_providers.base import VectorSearchQuery, VectorStore


qdrant_client: Optional[QdrantClient] = None
_vector_store: Optional["QdrantVectorStore"] = None


# Whitelist of extracted-metadata keys that are promoted to top-level payload
# fields so Qdrant can filter on them directly (e.g. ``year`` = 2024,
# ``category_ids`` contains 12). All values are flat — str/int/bool/list[str].
# Keeping this as an explicit list rather than a blind copy-everything keeps
# the payload schema predictable and easy to add indexes for.
_PROMOTED_METADATA_KEYS = (
    # Core post/page
    "year",
    "month",
    "date",
    "post_id",
    "type",
    "wp_type",
    "category_ids",
    "tag_ids",
    "slug",
    "author_id",
    # Event ACF
    "is_event",
    "event_start_date",
    "event_end_date",
    "event_year",
    "event_month",
    "event_location",
)


def sanitize_collection_component(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "_" for char in value)


def build_collection_name(assistant_name: Optional[str] = None, user_name: Optional[str] = None) -> str:
    if assistant_name and user_name:
        return f"{sanitize_collection_component(assistant_name)}_{sanitize_collection_component(user_name)}"
    return settings.DEFAULT_VECTOR_COLLECTION


def _distance_from_setting() -> Distance:
    return getattr(Distance, settings.VECTOR_DISTANCE.upper(), Distance.COSINE)


class QdrantVectorStore(VectorStore):
    def __init__(self):
        self._client: Optional[QdrantClient] = None

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            raise RuntimeError("Qdrant client not initialized")
        return self._client

    async def initialize(self) -> None:
        global qdrant_client
        self._client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None,
        )
        qdrant_client = self._client
        await self.ensure_collection()

    async def ensure_collection(self, assistant_name: Optional[str] = None, user_name: Optional[str] = None) -> str:
        collection_name = build_collection_name(assistant_name, user_name)
        collections = self.client.get_collections()
        collection_names = [collection.name for collection in collections.collections]

        if collection_name not in collection_names:
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=settings.VECTOR_SIZE, distance=_distance_from_setting()),
            )

        if assistant_name and user_name:
            try:
                self.client.create_payload_index(
                    collection_name=collection_name,
                    field_name="assistant_id",
                    field_schema=PayloadSchemaType.KEYWORD,
                )
            except Exception:
                pass

        # Create indexes for rich metadata fields to enable efficient filtering
        # on year, categories, event dates, etc. Qdrant requires indexes for fast
        # filtering on large collections (>10k points).
        _metadata_indexes = [
            ("year", PayloadSchemaType.INTEGER),
            ("month", PayloadSchemaType.INTEGER),
            ("category_ids", PayloadSchemaType.KEYWORD),
            ("tag_ids", PayloadSchemaType.KEYWORD),
            ("is_event", PayloadSchemaType.BOOL),
            ("event_year", PayloadSchemaType.INTEGER),
            ("event_month", PayloadSchemaType.INTEGER),
        ]
        for field_name, field_type in _metadata_indexes:
            try:
                self.client.create_payload_index(
                    collection_name=collection_name,
                    field_name=field_name,
                    field_schema=field_type,
                )
            except Exception:
                # Index may already exist or collection may be in use - continue
                pass

        return collection_name

    async def upsert(
        self,
        assistant_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        assistant_name: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> List[str]:
        collection_name = await self.ensure_collection(assistant_name, user_name)
        points = []
        point_ids = []

        for chunk, embedding in zip(chunks, embeddings):
            point_id = str(uuid.uuid4())
            point_ids.append(point_id)
            chunk_metadata = chunk.get("metadata", {}) or {}
            payload = {
                "assistant_id": assistant_id,
                "assistant_name": assistant_name or "unknown",
                "user_name": user_name or "unknown",
                "content": chunk["content"],
                "source_url": chunk["source_url"],
                "source_title": chunk.get("source_title", ""),
                "source_type": chunk.get("source_type", "general"),
                "intent": chunk["intent"],
                "confidence_score": chunk.get("confidence_score", 0.0),
                "requires_attribution": chunk.get("requires_attribution", True),
                "is_policy_content": chunk.get("is_policy_content", False),
                "is_sensitive": chunk.get("is_sensitive", False),
                "chunk_index": chunk.get("chunk_index", 0),
                "content_hash": chunk.get("content_hash", ""),
                "metadata": chunk_metadata,
            }
            # Promote rich metadata keys (year, categories, event_start_date, …)
            # to the top level of the payload so Qdrant filters can target them
            # directly without a nested-key path. Keep them inside ``metadata``
            # too for backward-compat with existing consumers.
            for key in _PROMOTED_METADATA_KEYS:
                if key in chunk_metadata and key not in payload:
                    payload[key] = chunk_metadata[key]
            points.append(PointStruct(id=point_id, vector=embedding, payload=payload))

        self.client.upsert(collection_name=collection_name, points=points)
        return point_ids

    async def search(self, query: VectorSearchQuery) -> List[Dict[str, Any]]:
        collection_name = build_collection_name(query.assistant_name, query.user_name)

        # Build the query_filter. We always pin to ``assistant_id`` for
        # tenant isolation. When ``query.payload_filters`` is non-empty
        # we delegate to ``backend.retrieval.filter_extractor.build_qdrant_filter``
        # so the structured-filter logic lives in one place. Imported
        # lazily to avoid a circular import in tests that stub the
        # vector store.
        query_filter: Any
        applied_keys: List[str] = []
        if query.payload_filters:
            try:
                from backend.retrieval.filter_extractor import build_qdrant_filter

                query_filter, applied_keys = build_qdrant_filter(
                    assistant_id=query.assistant_id,
                    filters=query.payload_filters,
                )
            except Exception:  # noqa: BLE001 — degrade to assistant-only filter
                query_filter = {
                    "must": [{"key": "assistant_id", "match": {"value": query.assistant_id}}]
                }
                applied_keys = []
        else:
            query_filter = {
                "must": [{"key": "assistant_id", "match": {"value": query.assistant_id}}]
            }

        try:
            search_result = self.client.search(
                collection_name=collection_name,
                query_vector=query.query_embedding,
                query_filter=query_filter,
                limit=query.limit,
                score_threshold=query.score_threshold,
            )
        except Exception:
            return []

        results = []
        for hit in search_result:
            results.append(
                {
                    "id": hit.id,
                    "score": hit.score,
                    "content": hit.payload["content"],
                    "source_url": hit.payload["source_url"],
                    "source_title": hit.payload.get("source_title", ""),
                    "source_type": hit.payload.get("source_type", "general"),
                    "intent": hit.payload["intent"],
                    "confidence_score": hit.payload.get("confidence_score", 0.0),
                    "requires_attribution": hit.payload.get("requires_attribution", True),
                    "is_policy_content": hit.payload.get("is_policy_content", False),
                    "is_sensitive": hit.payload.get("is_sensitive", False),
                    "assistant_name": hit.payload.get("assistant_name", "unknown"),
                    "user_name": hit.payload.get("user_name", "unknown"),
                    "metadata": hit.payload.get("metadata", {}),
                }
            )
        return results

    async def delete_assistant_content(
        self,
        assistant_id: str,
        assistant_name: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> None:
        self.client.delete(
            collection_name=build_collection_name(assistant_name, user_name),
            points_selector={
                "filter": {"must": [{"key": "assistant_id", "match": {"value": assistant_id}}]},
            },
        )

    async def delete_collection(self, assistant_name: str, user_name: str) -> None:
        self.client.delete_collection(build_collection_name(assistant_name, user_name))


def get_vector_store() -> QdrantVectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = QdrantVectorStore()
    return _vector_store


async def init_qdrant():
    await get_vector_store().initialize()


async def ensure_collections():
    await get_vector_store().ensure_collection()


async def ensure_assistant_collection(assistant_name: str, user_name: str):
    return await get_vector_store().ensure_collection(assistant_name, user_name)


def get_qdrant_client() -> QdrantClient:
    return get_vector_store().client


async def store_embeddings(
    assistant_id: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    assistant_name: Optional[str] = None,
    user_name: Optional[str] = None,
) -> List[str]:
    return await get_vector_store().upsert(
        assistant_id=assistant_id,
        chunks=chunks,
        embeddings=embeddings,
        assistant_name=assistant_name,
        user_name=user_name,
    )


async def search_similar_content(
    assistant_id: str,
    query_embedding: List[float],
    limit: int = 10,
    score_threshold: float = 0.7,
    assistant_name: Optional[str] = None,
    user_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return await get_vector_store().search(
        VectorSearchQuery(
            assistant_id=assistant_id,
            query_embedding=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
            assistant_name=assistant_name,
            user_name=user_name,
        )
    )


async def delete_assistant_content(assistant_id: str, assistant_name: Optional[str] = None, user_name: Optional[str] = None):
    await get_vector_store().delete_assistant_content(assistant_id, assistant_name, user_name)


async def delete_assistant_collection(assistant_name: str, user_name: str):
    await get_vector_store().delete_collection(assistant_name, user_name)
