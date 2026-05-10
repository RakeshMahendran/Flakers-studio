"""
Tests for Redis cache implementation with fakeredis.

These tests cover:
- Cache hit/miss scenarios for each cache type (embedding, filter, answer)
- Graceful degradation when Redis is unavailable
- TTL behavior
- Tenant isolation
- LRU fallback functionality
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import json

# Import the cache modules
from backend.cache.redis_cache import RedisCache, get_cache, _LRUCache
from backend.cache.decorators import cached_embedding, cached_filter_extraction, cached_answer
from backend.retrieval.filter_extractor import FilterResult


class TestLRUCache:
    """Tests for the in-memory LRU cache."""

    def test_lru_basic_operations(self):
        """Test basic get/set/delete operations."""
        cache = _LRUCache(max_size=3)

        # Set and get
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

        # Miss
        assert cache.get("nonexistent") is None

        # Delete
        cache.delete("key1")
        assert cache.get("key1") is None

    def test_lru_eviction(self):
        """Test LRU eviction when max size is reached."""
        cache = _LRUCache(max_size=2)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")  # Should evict key1

        assert cache.get("key1") is None
        assert cache.get("key2") == "value2"
        assert cache.get("key3") == "value3"

    def test_lru_move_to_end(self):
        """Test that accessing an item moves it to the end."""
        cache = _LRUCache(max_size=2)

        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.get("key1")  # Access key1
        cache.set("key3", "value3")  # Should evict key2, not key1

        assert cache.get("key1") == "value1"
        assert cache.get("key2") is None
        assert cache.get("key3") == "value3"


@pytest.mark.asyncio
class TestRedisCache:
    """Tests for RedisCache with fakeredis."""

    @pytest.fixture
    async def fake_redis_cache(self):
        """Create a RedisCache instance with fakeredis."""
        try:
            import fakeredis.aioredis
            fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

            # Create cache with mocked Redis client
            cache = RedisCache(redis_url="redis://fake", use_lru_fallback=True)
            cache._redis_client = fake_redis
            cache._connected = True

            yield cache

            # Cleanup
            await fake_redis.flushall()
            await fake_redis.close()
        except ImportError:
            pytest.skip("fakeredis not installed")

    @pytest.fixture
    def no_redis_cache(self):
        """Create a RedisCache instance without Redis (LRU only)."""
        cache = RedisCache(redis_url="", use_lru_fallback=True)
        return cache

    async def test_cache_basic_operations(self, fake_redis_cache):
        """Test basic get/set/delete operations with Redis."""
        cache = fake_redis_cache

        # Set and get
        await cache.set("test_key", {"data": "value"}, ttl=60)
        result = await cache.get("test_key")
        assert result == {"data": "value"}

        # Delete
        await cache.delete("test_key")
        result = await cache.get("test_key")
        assert result is None

    async def test_cache_ttl(self, fake_redis_cache):
        """Test TTL functionality."""
        cache = fake_redis_cache

        # Set with TTL
        await cache.set("ttl_key", "value", ttl=1)
        assert await cache.get("ttl_key") == "value"

        # Wait for expiration
        await asyncio.sleep(1.1)
        assert await cache.get("ttl_key") is None

    async def test_cache_json_serialization(self, fake_redis_cache):
        """Test JSON serialization of complex objects."""
        cache = fake_redis_cache

        data = {
            "list": [1, 2, 3],
            "dict": {"nested": "value"},
            "string": "test",
            "number": 42,
        }

        await cache.set("json_key", data)
        result = await cache.get("json_key")
        assert result == data

    async def test_cache_clear_prefix(self, fake_redis_cache):
        """Test clearing keys by prefix."""
        cache = fake_redis_cache

        # Set multiple keys
        await cache.set("tenant1:key1", "value1")
        await cache.set("tenant1:key2", "value2")
        await cache.set("tenant2:key1", "value3")

        # Clear tenant1 keys
        count = await cache.clear_prefix("tenant1:")
        assert count == 2

        # Verify
        assert await cache.get("tenant1:key1") is None
        assert await cache.get("tenant1:key2") is None
        assert await cache.get("tenant2:key1") == "value3"

    async def test_fallback_to_lru(self, no_redis_cache):
        """Test that cache falls back to LRU when Redis unavailable."""
        cache = no_redis_cache

        # Should use LRU
        await cache.set("lru_key", "lru_value")
        result = await cache.get("lru_key")
        assert result == "lru_value"

    async def test_graceful_degradation(self):
        """Test graceful degradation when Redis connection fails."""
        cache = RedisCache(redis_url="redis://invalid:9999", use_lru_fallback=True)

        # Should not crash, should use LRU fallback
        await cache.set("key", "value")
        result = await cache.get("key")
        assert result == "value"  # From LRU


@pytest.mark.asyncio
class TestCachedEmbedding:
    """Tests for @cached_embedding decorator."""

    @pytest.fixture
    def mock_cache(self):
        """Create a mock cache."""
        cache = MagicMock()
        cache.get = AsyncMock(return_value=None)
        cache.set = AsyncMock(return_value=True)
        return cache

    async def test_embedding_cache_miss(self, mock_cache):
        """Test embedding generation on cache miss."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_embedding()
            async def generate_embeddings(self, texts, tenant_id=None):
                return [[0.1, 0.2, 0.3] for _ in texts]

            # Mock self object with embedding_deployment
            mock_self = MagicMock()
            mock_self.embedding_deployment = "text-embedding-3-large"

            result = await generate_embeddings(mock_self, ["test text"], tenant_id="tenant1")

            assert result == [[0.1, 0.2, 0.3]]
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_called_once()

    async def test_embedding_cache_hit(self, mock_cache):
        """Test embedding retrieval on cache hit."""
        cached_embeddings = [[0.5, 0.6, 0.7]]
        mock_cache.get = AsyncMock(return_value=cached_embeddings)

        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_embedding()
            async def generate_embeddings(self, texts, tenant_id=None):
                pytest.fail("Should not be called on cache hit")

            mock_self = MagicMock()
            mock_self.embedding_deployment = "text-embedding-3-large"

            result = await generate_embeddings(mock_self, ["test text"], tenant_id="tenant1")

            assert result == cached_embeddings
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_not_called()


@pytest.mark.asyncio
class TestCachedFilterExtraction:
    """Tests for @cached_filter_extraction decorator."""

    @pytest.fixture
    def mock_cache(self):
        """Create a mock cache."""
        cache = MagicMock()
        cache.get = AsyncMock(return_value=None)
        cache.set = AsyncMock(return_value=True)
        return cache

    async def test_filter_cache_miss(self, mock_cache):
        """Test filter extraction on cache miss."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_filter_extraction()
            async def extract_filters(self, query, tenant_id=None, assistant_id=None):
                return FilterResult(filters={"year": 2024}, intent="events")

            mock_self = MagicMock()
            result = await extract_filters(
                mock_self,
                query="events in 2024",
                tenant_id="tenant1",
                assistant_id="asst1"
            )

            assert result.filters == {"year": 2024}
            assert result.intent == "events"
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_called_once()

    async def test_filter_cache_hit(self, mock_cache):
        """Test filter extraction on cache hit."""
        cached_data = {
            "filters": {"year": 2024},
            "intent": "events",
            "confidence": "high",
            "needs_aggregation": False,
            "raw_response": "{}",
        }
        mock_cache.get = AsyncMock(return_value=cached_data)

        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_filter_extraction()
            async def extract_filters(self, query, tenant_id=None, assistant_id=None):
                pytest.fail("Should not be called on cache hit")

            mock_self = MagicMock()
            result = await extract_filters(
                mock_self,
                query="events in 2024",
                tenant_id="tenant1",
                assistant_id="asst1"
            )

            assert result.filters == {"year": 2024}
            assert result.intent == "events"
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_not_called()

    async def test_filter_empty_query_bypass(self, mock_cache):
        """Test that empty queries bypass cache."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_filter_extraction()
            async def extract_filters(self, query, tenant_id=None, assistant_id=None):
                return FilterResult()

            mock_self = MagicMock()
            result = await extract_filters(mock_self, query="", tenant_id="tenant1")

            mock_cache.get.assert_not_called()
            mock_cache.set.assert_not_called()


@pytest.mark.asyncio
class TestCachedAnswer:
    """Tests for @cached_answer decorator."""

    @pytest.fixture
    def mock_cache(self):
        """Create a mock cache."""
        cache = MagicMock()
        cache.get = AsyncMock(return_value=None)
        cache.set = AsyncMock(return_value=True)
        return cache

    async def test_answer_cache_miss(self, mock_cache):
        """Test answer generation on cache miss."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_answer()
            async def generate_answer(
                self,
                tenant_id=None,
                assistant_id=None,
                user_message=None,
                retrieved_chunks=None,
                used_fallback=False,
            ):
                return {"content": "Test answer", "usage": {}}

            mock_self = MagicMock()
            result = await generate_answer(
                mock_self,
                tenant_id="tenant1",
                assistant_id="asst1",
                user_message="What is AI?",
                retrieved_chunks=[{"id": "chunk1"}],
                used_fallback=False,
            )

            assert result["content"] == "Test answer"
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_called_once()

    async def test_answer_cache_hit(self, mock_cache):
        """Test answer retrieval on cache hit."""
        cached_answer = {"content": "Cached answer", "usage": {}}
        mock_cache.get = AsyncMock(return_value=cached_answer)

        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_answer()
            async def generate_answer(
                self,
                tenant_id=None,
                assistant_id=None,
                user_message=None,
                retrieved_chunks=None,
                used_fallback=False,
            ):
                pytest.fail("Should not be called on cache hit")

            mock_self = MagicMock()
            result = await generate_answer(
                mock_self,
                tenant_id="tenant1",
                assistant_id="asst1",
                user_message="What is AI?",
                retrieved_chunks=[{"id": "chunk1"}],
                used_fallback=False,
            )

            assert result == cached_answer
            mock_cache.get.assert_called_once()
            mock_cache.set.assert_not_called()

    async def test_answer_fallback_not_cached(self, mock_cache):
        """Test that fallback responses are never cached."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_answer()
            async def generate_answer(
                self,
                tenant_id=None,
                assistant_id=None,
                user_message=None,
                retrieved_chunks=None,
                used_fallback=False,
            ):
                return {"content": "Fallback answer", "usage": {}}

            mock_self = MagicMock()
            result = await generate_answer(
                mock_self,
                tenant_id="tenant1",
                assistant_id="asst1",
                user_message="What is AI?",
                retrieved_chunks=[],
                used_fallback=True,  # Fallback response
            )

            assert result["content"] == "Fallback answer"
            # Should NOT cache fallback responses
            mock_cache.get.assert_not_called()
            mock_cache.set.assert_not_called()

    async def test_answer_tenant_isolation(self, mock_cache):
        """Test that cache keys include tenant_id for isolation."""
        with patch("backend.cache.decorators.get_cache", return_value=mock_cache):

            @cached_answer()
            async def generate_answer(
                self,
                tenant_id=None,
                assistant_id=None,
                user_message=None,
                retrieved_chunks=None,
                used_fallback=False,
            ):
                return {"content": f"Answer for {tenant_id}", "usage": {}}

            mock_self = MagicMock()

            # Call with tenant1
            await generate_answer(
                mock_self,
                tenant_id="tenant1",
                assistant_id="asst1",
                user_message="What is AI?",
                retrieved_chunks=[{"id": "chunk1"}],
                used_fallback=False,
            )

            # Call with tenant2
            await generate_answer(
                mock_self,
                tenant_id="tenant2",
                assistant_id="asst1",
                user_message="What is AI?",
                retrieved_chunks=[{"id": "chunk1"}],
                used_fallback=False,
            )

            # Should have different cache keys (2 get calls, 2 set calls)
            assert mock_cache.get.call_count == 2
            assert mock_cache.set.call_count == 2

            # Verify cache keys are different
            call_keys = [call[0][0] for call in mock_cache.get.call_args_list]
            assert call_keys[0] != call_keys[1]
            assert "tenant1" in call_keys[0]
            assert "tenant2" in call_keys[1]


@pytest.mark.asyncio
class TestCacheIntegration:
    """Integration tests for cache system."""

    async def test_end_to_end_caching(self):
        """Test end-to-end caching with real LRU fallback."""
        # Create cache with no Redis (LRU only)
        cache = RedisCache(redis_url="", use_lru_fallback=True)

        # Simulate embedding caching
        embedding_key = "emb:tenant1:hash123"
        embedding_value = [[0.1, 0.2, 0.3]]

        await cache.set(embedding_key, embedding_value, ttl=60)
        result = await cache.get(embedding_key)
        assert result == embedding_value

        # Simulate filter caching
        filter_key = "filter:tenant1:hash456"
        filter_value = {"filters": {"year": 2024}, "intent": "events"}

        await cache.set(filter_key, filter_value, ttl=60)
        result = await cache.get(filter_key)
        assert result == filter_value

        # Simulate answer caching
        answer_key = "answer:tenant1:hash789"
        answer_value = {"content": "AI is...", "usage": {}}

        await cache.set(answer_key, answer_value, ttl=60)
        result = await cache.get(answer_key)
        assert result == answer_value

    async def test_cache_disabled(self):
        """Test that caching can be disabled globally."""
        with patch("backend.cache.decorators.settings") as mock_settings:
            mock_settings.CACHE_ENABLED = False

            @cached_embedding()
            async def generate_embeddings(self, texts, tenant_id=None):
                return [[0.1, 0.2, 0.3]]

            mock_self = MagicMock()
            mock_self.embedding_deployment = "model"

            # Should bypass cache entirely
            result = await generate_embeddings(mock_self, ["test"], tenant_id="tenant1")
            assert result == [[0.1, 0.2, 0.3]]
