"""
Cache decorators for embeddings, filter extraction, and final answers.

These decorators wrap async functions and cache their results in Redis with
appropriate TTLs. Cache keys always include tenant_id to prevent cross-tenant
leakage.

Usage:
    @cached_embedding(ttl=86400)
    async def generate_embeddings(self, texts: list[str], tenant_id: str = None) -> list[list[float]]:
        ...

Key structure:
    - Embedding: "emb:{tenant_id}:{sha256(text+model)}"
    - Filter: "filter:{tenant_id}:{sha256(query+schema_version)}"
    - Answer: "answer:{tenant_id}:{sha256(assistant_id+query+chunk_hashes+content_version)}"
"""
from __future__ import annotations

import functools
import hashlib
import json
import logging
from typing import Any, Callable, Optional

from backend.cache.redis_cache import get_cache
from backend.config.settings import settings

logger = logging.getLogger(__name__)


def _hash_key(*parts: Any) -> str:
    """Generate a SHA-256 hash from multiple parts."""
    combined = "|".join(str(p) for p in parts)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def _is_cache_enabled() -> bool:
    """Check if caching is globally enabled."""
    return getattr(settings, "CACHE_ENABLED", True)


def cached_embedding(ttl: Optional[int] = None):
    """
    Cache decorator for embedding generation.

    Caches embeddings by (text, model, tenant_id). Cache key format:
        emb:{tenant_id}:{hash(text+model)}

    Args:
        ttl: Time-to-live in seconds. Defaults to settings.CACHE_TTL_EMBEDDING (86400).

    The decorated function must accept 'tenant_id' as a keyword argument.
    For batch operations on lists of texts, the decorator caches the entire batch.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not _is_cache_enabled():
                return await func(*args, **kwargs)

            # Extract tenant_id from kwargs
            tenant_id = kwargs.get("tenant_id") or "default"

            # For embedding methods, we need to handle both single text and batch
            # The function signature is: generate_embeddings(self, texts: list[str])
            # We'll cache based on the entire batch input
            instance = args[0] if args else None
            texts = args[1] if len(args) > 1 else kwargs.get("texts", [])

            # Get model name from instance if available
            model = getattr(instance, "embedding_deployment", "unknown") if instance else "unknown"

            # Create cache key from texts + model
            # For batch: hash all texts together
            texts_str = json.dumps(texts, sort_keys=True) if isinstance(texts, list) else str(texts)
            cache_key = f"emb:{tenant_id}:{_hash_key(texts_str, model)}"

            # Try to get from cache
            cache = get_cache()
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.info("Embedding cache HIT: %s texts from cache", len(texts) if isinstance(texts, list) else 1)
                return cached_value

            # Cache miss - call the actual function
            logger.debug("Embedding cache MISS: calling Azure")
            result = await func(*args, **kwargs)

            # Store in cache with TTL
            effective_ttl = ttl or getattr(settings, "CACHE_TTL_EMBEDDING", 86400)
            await cache.set(cache_key, result, ttl=effective_ttl)

            return result

        return wrapper
    return decorator


def cached_filter_extraction(ttl: Optional[int] = None):
    """
    Cache decorator for LLM-based filter extraction.

    Caches filter extraction results by (query, schema_version, tenant_id).
    Cache key format:
        filter:{tenant_id}:{hash(query+schema_version)}

    Args:
        ttl: Time-to-live in seconds. Defaults to settings.CACHE_TTL_FILTER (3600).

    The decorated function must accept 'tenant_id' as a keyword argument.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not _is_cache_enabled():
                return await func(*args, **kwargs)

            # Extract parameters
            tenant_id = kwargs.get("tenant_id") or "default"
            query = kwargs.get("query", "")

            # Schema version for cache invalidation when schema changes
            schema_version = getattr(settings, "FILTER_SCHEMA_VERSION", "v1")

            if not query:
                return await func(*args, **kwargs)

            # Create cache key
            cache_key = f"filter:{tenant_id}:{_hash_key(query.lower().strip(), schema_version)}"

            # Try to get from cache
            cache = get_cache()
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.info("Filter extraction cache HIT for query: %s", query[:50])
                # Reconstruct FilterResult from cached dict
                from backend.retrieval.filter_extractor import FilterResult
                if isinstance(cached_value, dict):
                    return FilterResult(**cached_value)
                return cached_value

            # Cache miss - call the actual function
            logger.debug("Filter extraction cache MISS for query: %s", query[:50])
            result = await func(*args, **kwargs)

            # Don't cache empty results or errors
            if result and (not hasattr(result, "is_empty") or not result.is_empty):
                # Convert FilterResult to dict for caching
                cache_data = {
                    "filters": getattr(result, "filters", {}),
                    "intent": getattr(result, "intent", "general"),
                    "confidence": getattr(result, "confidence", "none"),
                    "needs_aggregation": getattr(result, "needs_aggregation", False),
                    "raw_response": getattr(result, "raw_response", ""),
                }

                effective_ttl = ttl or getattr(settings, "CACHE_TTL_FILTER", 3600)
                await cache.set(cache_key, cache_data, ttl=effective_ttl)

            return result

        return wrapper
    return decorator


def cached_answer(ttl: Optional[int] = None):
    """
    Cache decorator for final LLM answer synthesis.

    Caches answers by (assistant_id, query, chunk_hashes, content_version, tenant_id).
    Cache key format:
        answer:{tenant_id}:{hash(assistant_id+query+chunk_hashes+content_version)}

    Args:
        ttl: Time-to-live in seconds. Defaults to settings.CACHE_TTL_ANSWER (900).

    IMPORTANT:
        - NEVER cache responses with used_fallback=True
        - Cache must include content_version to invalidate on re-ingestion
        - Short TTL because content can change

    The decorated function must accept these keyword arguments:
        - tenant_id
        - assistant_id
        - user_message (or query)
        - retrieved_chunks (to hash chunk IDs)
        - used_fallback (to determine if cacheable)
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            if not _is_cache_enabled():
                return await func(*args, **kwargs)

            # Extract parameters
            tenant_id = kwargs.get("tenant_id") or "default"
            assistant_id = kwargs.get("assistant_id") or ""
            user_message = kwargs.get("user_message") or kwargs.get("query", "")
            retrieved_chunks = kwargs.get("retrieved_chunks") or []
            used_fallback = kwargs.get("used_fallback", False)

            # NEVER cache fallback responses
            if used_fallback:
                logger.debug("Skipping cache for fallback response")
                return await func(*args, **kwargs)

            # Don't cache if essential parameters are missing
            if not assistant_id or not user_message:
                return await func(*args, **kwargs)

            # Content version for invalidation when assistant content changes
            # This should be bumped whenever content is re-ingested
            content_version = getattr(settings, "CONTENT_VERSION", "v1")

            # Create hash of chunk IDs to detect when different chunks are retrieved
            chunk_hashes = [chunk.get("id", "") for chunk in retrieved_chunks if isinstance(chunk, dict)]
            chunk_hash = _hash_key(*sorted(chunk_hashes)) if chunk_hashes else "no_chunks"

            # Create cache key
            cache_key = f"answer:{tenant_id}:{_hash_key(assistant_id, user_message.lower().strip(), chunk_hash, content_version)}"

            # Try to get from cache
            cache = get_cache()
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                logger.info("Answer cache HIT for assistant %s, query: %s", assistant_id[:8], user_message[:50])
                return cached_value

            # Cache miss - call the actual function
            logger.debug("Answer cache MISS for assistant %s", assistant_id[:8])
            result = await func(*args, **kwargs)

            # Only cache successful responses with content
            if result and isinstance(result, dict) and result.get("content"):
                effective_ttl = ttl or getattr(settings, "CACHE_TTL_ANSWER", 900)
                await cache.set(cache_key, result, ttl=effective_ttl)

            return result

        return wrapper
    return decorator
