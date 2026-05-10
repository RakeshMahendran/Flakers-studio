"""
Redis-backed caching layer for embeddings and LLM responses.
"""
from backend.cache.redis_cache import RedisCache
from backend.cache.decorators import (
    cached_embedding,
    cached_filter_extraction,
    cached_answer,
)

__all__ = [
    "RedisCache",
    "cached_embedding",
    "cached_filter_extraction",
    "cached_answer",
]
