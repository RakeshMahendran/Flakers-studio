"""
Qdrant vector database client for semantic search
"""
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType
from typing import List, Dict, Any, Optional
import uuid

from app.core.config import settings

# Global Qdrant client
qdrant_client: Optional[QdrantClient] = None

async def init_qdrant():
    """Initialize Qdrant client and collections"""
    global qdrant_client
    
    qdrant_client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
    )
    
    # Ensure collections exist
    await ensure_collections()

async def ensure_collections():
    """Ensure required Qdrant collections exist"""
    collection_name = "flakers_content"
    
    try:
        # Check if collection exists
        collections = qdrant_client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if collection_name not in collection_names:
            # Create collection with proper vector configuration for text-embedding-3-large
            qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=3072,  # text-embedding-3-large dimension
                    distance=Distance.COSINE
                )
            )
            print(f"Created Qdrant collection: {collection_name}")
        else:
            print(f"Qdrant collection already exists: {collection_name}")
            
    except Exception as e:
        print(f"Error initializing Qdrant collections: {e}")
        raise

async def ensure_assistant_collection(assistant_name: str, user_name: str):
    """Ensure assistant-specific collection exists with proper indexing"""
    # Create safe collection name from assistant name + user name
    safe_assistant_name = "".join(c.lower() if c.isalnum() else "_" for c in assistant_name)
    safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
    collection_name = f"{safe_assistant_name}_{safe_user_name}"
    
    try:
        # Check if collection exists
        collections = qdrant_client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if collection_name not in collection_names:
            # Create collection with proper vector configuration
            qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=3072,  # text-embedding-3-large dimension
                    distance=Distance.COSINE
                )
            )
            
            # Create payload index for assistant_id to enable filtering
            qdrant_client.create_payload_index(
                collection_name=collection_name,
                field_name="assistant_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            
            print(f"Created assistant-specific Qdrant collection with index: {collection_name}")
        else:
            # Collection exists, ensure index exists
            try:
                qdrant_client.create_payload_index(
                    collection_name=collection_name,
                    field_name="assistant_id",
                    field_schema=PayloadSchemaType.KEYWORD
                )
                print(f"Created index for existing collection: {collection_name}")
            except Exception as idx_error:
                # Index might already exist, that's okay
                print(f"Index may already exist for {collection_name}: {idx_error}")
            
    except Exception as e:
        print(f"Error creating assistant collection: {e}")
        raise

def get_qdrant_client() -> QdrantClient:
    """Get the global Qdrant client"""
    if qdrant_client is None:
        raise RuntimeError("Qdrant client not initialized")
    return qdrant_client

async def store_embeddings(
    assistant_id: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
    assistant_name: Optional[str] = None,
    user_name: Optional[str] = None
) -> List[str]:
    """
    Store content chunks with embeddings in Qdrant
    
    Args:
        assistant_id: Assistant UUID
        chunks: List of content chunk data
        embeddings: List of embedding vectors
        assistant_name: Assistant name for collection naming
        user_name: User name for collection naming
        
    Returns:
        List of Qdrant point IDs
    """
    client = get_qdrant_client()
    
    # Use assistant-specific collection if names provided
    if assistant_name and user_name:
        safe_assistant_name = "".join(c.lower() if c.isalnum() else "_" for c in assistant_name)
        safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
        collection_name = f"{safe_assistant_name}_{safe_user_name}"
        await ensure_assistant_collection(assistant_name, user_name)
    else:
        collection_name = "flakers_content"
    
    points = []
    point_ids = []
    
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid4())
        point_ids.append(point_id)
        
        # Create payload with governance metadata
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
            "metadata": chunk.get("metadata", {})
        }
        
        points.append(PointStruct(
            id=point_id,
            vector=embedding,
            payload=payload
        ))
    
    # Batch upsert points
    client.upsert(
        collection_name=collection_name,
        points=points
    )
    
    return point_ids

async def search_similar_content(
    assistant_id: str,
    query_embedding: List[float],
    limit: int = 10,
    score_threshold: float = 0.7,
    assistant_name: Optional[str] = None,
    user_name: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search for similar content chunks
    
    Args:
        assistant_id: Assistant UUID to filter by
        query_embedding: Query vector
        limit: Maximum results to return
        score_threshold: Minimum similarity score
        assistant_name: Assistant name for collection naming
        user_name: User name for collection naming
        
    Returns:
        List of matching chunks with metadata
    """
    client = get_qdrant_client()
    
    # Use assistant-specific collection if names provided
    if assistant_name and user_name:
        safe_assistant_name = "".join(c.lower() if c.isalnum() else "_" for c in assistant_name)
        safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
        collection_name = f"{safe_assistant_name}_{safe_user_name}"
    else:
        collection_name = "flakers_content"
    
    print(f"[SEARCH] Collection: {collection_name}, Assistant ID: {assistant_id}")
    
    try:
        # Search with assistant filter
        search_result = client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            query_filter={
                "must": [
                    {"key": "assistant_id", "match": {"value": assistant_id}}
                ]
            },
            limit=limit,
            score_threshold=score_threshold
        )
        
        # Format results
        results = []
        for hit in search_result:
            result = {
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
                "metadata": hit.payload.get("metadata", {})
            }
            results.append(result)
        
        return results
    
    except Exception as e:
        print(f"Error searching collection {collection_name}: {e}")
        # Return empty results if collection doesn't exist or search fails
        return []

async def delete_assistant_content(assistant_id: str, assistant_name: Optional[str] = None, user_name: Optional[str] = None):
    """Delete all content for an assistant"""
    client = get_qdrant_client()
    
    # Use assistant-specific collection if names provided
    if assistant_name and user_name:
        safe_assistant_name = "".join(c.lower() if c.isalnum() else "_" for c in assistant_name)
        safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
        collection_name = f"{safe_assistant_name}_{safe_user_name}"
    else:
        collection_name = "flakers_content"
    
    # Delete points by assistant_id filter
    client.delete(
        collection_name=collection_name,
        points_selector={
            "filter": {
                "must": [
                    {"key": "assistant_id", "match": {"value": assistant_id}}
                ]
            }
        }
    )

async def delete_assistant_collection(assistant_name: str, user_name: str):
    """Delete entire assistant collection"""
    client = get_qdrant_client()
    safe_assistant_name = "".join(c.lower() if c.isalnum() else "_" for c in assistant_name)
    safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
    collection_name = f"{safe_assistant_name}_{safe_user_name}"
    
    try:
        client.delete_collection(collection_name)
        print(f"Deleted assistant collection: {collection_name}")
    except Exception as e:
        print(f"Error deleting assistant collection: {e}")
        raise