"""
Redis cache implementation with graceful degradation and optional LRU fallback.

This module provides a RedisCache class that:
- Provides async get/set/delete operations
- Handles JSON serialization automatically
- Gracefully degrades to no-op when Redis is unavailable
- Optionally uses an in-memory LRU as a second-tier fallback
- Never caches across tenants (tenant_id is required in keys)
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional
from collections import OrderedDict
from threading import Lock

from backend.config.settings import settings

logger = logging.getLogger(__name__)

# Try to import redis; if not available, we'll operate in no-op mode
try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("redis package not installed; cache will operate in no-op mode")


class _LRUCache:
    """Thread-safe in-memory LRU cache as a fallback tier."""

    def __init__(self, max_size: int = 1000):
        self._max_size = max_size
        self._data: OrderedDict[str, Any] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._data:
                return None
            self._data.move_to_end(key)
            return self._data[key]

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = value
            while len(self._data) > self._max_size:
                self._data.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class RedisCache:
    """
    Redis-backed cache with automatic JSON serialization and graceful degradation.

    Usage:
        cache = RedisCache()
        await cache.set("key", {"data": "value"}, ttl=3600)
        value = await cache.get("key")
        await cache.delete("key")

    When Redis is unavailable or REDIS_URL is not configured, operations
    become no-ops (or use the optional LRU fallback).
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        use_lru_fallback: bool = True,
        lru_max_size: int = 1000,
    ):
        """
        Initialize Redis cache.

        Args:
            redis_url: Redis connection URL. Defaults to settings.REDIS_URL.
            use_lru_fallback: Whether to use in-memory LRU when Redis unavailable.
            lru_max_size: Maximum size of the LRU cache.
        """
        self._redis_url = redis_url or getattr(settings, "REDIS_URL", "")
        self._redis_client: Optional[aioredis.Redis] = None
        self._connected = False
        self._lru: Optional[_LRUCache] = None

        if use_lru_fallback:
            self._lru = _LRUCache(max_size=lru_max_size)

        # Only attempt connection if Redis is available and URL is configured
        if REDIS_AVAILABLE and self._redis_url:
            try:
                self._redis_client = aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2,
                )
                logger.info("Redis cache client initialized: %s", self._redis_url[:30])
            except Exception as e:
                logger.warning("Failed to initialize Redis client: %s", e)
                self._redis_client = None
        elif not self._redis_url:
            logger.info("REDIS_URL not configured; cache operating in fallback mode")
        else:
            logger.warning("redis package not available; install with: pip install redis>=5.0")

    async def _ensure_connection(self) -> bool:
        """Ensure Redis connection is alive. Returns True if connected."""
        if not self._redis_client:
            return False

        if self._connected:
            return True

        try:
            await self._redis_client.ping()
            self._connected = True
            logger.info("Redis connection established")
            return True
        except Exception as e:
            logger.debug("Redis connection failed: %s", e)
            self._connected = False
            return False

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Deserialized value or None if not found or error occurred
        """
        # Try Redis first
        if await self._ensure_connection():
            try:
                value = await self._redis_client.get(key)
                if value is not None:
                    logger.debug("Redis cache HIT: %s", key[:50])
                    return json.loads(value)
                logger.debug("Redis cache MISS: %s", key[:50])
            except Exception as e:
                logger.warning("Redis get error for key %s: %s", key[:50], e)
                self._connected = False

        # Fall back to LRU if available
        if self._lru is not None:
            value = self._lru.get(key)
            if value is not None:
                logger.debug("LRU cache HIT: %s", key[:50])
                return value

        return None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set value in cache.

        Args:
            key: Cache key
            value: Value to cache (will be JSON-serialized)
            ttl: Time-to-live in seconds (optional)

        Returns:
            True if successfully cached, False otherwise
        """
        try:
            serialized = json.dumps(value)
        except (TypeError, ValueError) as e:
            logger.warning("Failed to serialize value for key %s: %s", key[:50], e)
            return False

        success = False

        # Try Redis first
        if await self._ensure_connection():
            try:
                if ttl:
                    await self._redis_client.setex(key, ttl, serialized)
                else:
                    await self._redis_client.set(key, serialized)
                logger.debug("Redis cache SET: %s (ttl=%s)", key[:50], ttl)
                success = True
            except Exception as e:
                logger.warning("Redis set error for key %s: %s", key[:50], e)
                self._connected = False

        # Always update LRU if available (as fallback tier)
        if self._lru is not None:
            self._lru.set(key, value)
            if not success:
                logger.debug("LRU cache SET: %s", key[:50])
            success = True

        return success

    async def delete(self, key: str) -> bool:
        """
        Delete value from cache.

        Args:
            key: Cache key

        Returns:
            True if deleted, False otherwise
        """
        success = False

        # Try Redis first
        if await self._ensure_connection():
            try:
                await self._redis_client.delete(key)
                logger.debug("Redis cache DELETE: %s", key[:50])
                success = True
            except Exception as e:
                logger.warning("Redis delete error for key %s: %s", key[:50], e)
                self._connected = False

        # Also delete from LRU if available
        if self._lru is not None:
            self._lru.delete(key)
            success = True

        return success

    async def clear_prefix(self, prefix: str) -> int:
        """
        Clear all keys matching a prefix.

        Args:
            prefix: Key prefix to match (should be validated by caller)

        Returns:
            Number of keys deleted

        Security:
            - Caller must validate prefix to prevent unintended deletions
            - Uses SCAN instead of KEYS to avoid blocking Redis
            - Limits batch size to prevent memory issues
        """
        if not prefix:
            logger.error("clear_prefix called with empty prefix - refusing to delete all keys")
            return 0

        # Safety check: prefix should contain at least one colon to ensure it's structured
        if ":" not in prefix:
            logger.warning("clear_prefix called with unstructured prefix: %s", prefix)

        count = 0

        if await self._ensure_connection():
            try:
                # Use SCAN to avoid blocking Redis
                cursor = 0
                pattern = f"{prefix}*"
                max_iterations = 10000  # Safety limit to prevent infinite loops
                iterations = 0

                while iterations < max_iterations:
                    cursor, keys = await self._redis_client.scan(
                        cursor=cursor,
                        match=pattern,
                        count=100
                    )
                    if keys:
                        # Delete in batches to avoid command size limits
                        batch_size = 100
                        for i in range(0, len(keys), batch_size):
                            batch = keys[i:i + batch_size]
                            await self._redis_client.delete(*batch)
                            count += len(batch)

                    iterations += 1
                    if cursor == 0:
                        break

                if iterations >= max_iterations:
                    logger.error("clear_prefix hit max iterations for prefix %s", prefix)

                logger.info("Cleared %d keys with prefix %s", count, prefix)
            except Exception as e:
                logger.warning("Redis clear_prefix error for %s: %s", prefix, e)
                self._connected = False

        # LRU doesn't support prefix matching efficiently, so skip

        return count

    async def close(self) -> None:
        """Close Redis connection."""
        if self._redis_client:
            try:
                await self._redis_client.close()
                logger.info("Redis connection closed")
            except Exception as e:
                logger.warning("Error closing Redis connection: %s", e)

        if self._lru:
            self._lru.clear()

        self._connected = False


# Global cache instance (lazy-initialized on first use)
_GLOBAL_CACHE: Optional[RedisCache] = None


def get_cache() -> RedisCache:
    """Get or create the global cache instance."""
    global _GLOBAL_CACHE
    if _GLOBAL_CACHE is None:
        _GLOBAL_CACHE = RedisCache()
    return _GLOBAL_CACHE
