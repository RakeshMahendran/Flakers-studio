# Branch: feat/redis-cache
**Worktree:** `E:\FS-cache`
**Phase:** 4 — Infra
**Depends on:** filter-extract (so `cached_filter_extraction` decorator has a target)

---

You are in worktree FS-cache on branch feat/redis-cache.

## GOAL
Add a Redis-backed cache for: (1) embeddings (cache hit: skip Azure call), (2) LLM filter-extraction results, (3) LLM final answers for repeated identical (assistant_id, query) pairs.

## READ FIRST
1. `backend/services/azure_ai.py` — current Azure client
2. `backend/retrieval/rag_pipeline.py` — where caching could land
3. `server/requirements.txt` — confirm redis is commented out
4. `backend/config/settings.py` — settings shape

## DELIVERABLES

### 1. Dependency
Uncomment + pin: `redis>=5.0,<6.0` in `server/requirements.txt`

### 2. New file: `backend/cache/redis_cache.py`
Class `RedisCache`:
- async API: `get(key)`, `set(key, value, ttl)`, `delete(key)`
- JSON serialization
- Graceful no-op when `settings.REDIS_URL` is empty (dev mode without Redis)
- Optional in-memory LRU fallback (`cachetools.LRUCache`) as second-tier

### 3. New file: `backend/cache/decorators.py`
Cache wrappers (decorator-style, NOT modifying call sites everywhere):
- `@cached_embedding(ttl=86400)` — key = `sha256(text+model)`
- `@cached_filter_extraction(ttl=3600)` — key = `sha256(query+schema_version)`
- `@cached_answer(ttl=900)` — key = `sha256(assistant_id+query+top_k_chunk_hashes)`, short TTL because content can change

### 4. Apply decorators
- `backend/services/azure_ai.py` — embedding method gets `@cached_embedding`
- `filter_extractor.py` if branch feat/llm-filter-extraction has merged — otherwise document where to add it
- `rag_pipeline.py` final answer step — `@cached_answer`

### 5. Settings
- `settings.REDIS_URL` (default `""`)
- `settings.CACHE_ENABLED` (default `True`)
- `settings.CACHE_TTL_EMBEDDING/FILTER/ANSWER`

### 6. Cache-bust API
`backend/api/routes/admin.py` (or extend existing admin route) — `POST /admin/cache/clear` to wipe all keys for a given tenant.

### 7. Tests
`tests/backend/unit/test_redis_cache.py`:
- Use fakeredis or mocked redis
- Hit/miss cases for each cache type
- Graceful degradation when Redis unreachable

## CONSTRAINTS
- NEVER cache a response that came from a fallback path (`used_fallback=True`). Mark non-cacheable.
- NEVER cache across tenants. `tenant_id` MUST be in every cache key.
- Cache invalidation: when an assistant's content is re-ingested, bump a per-assistant `content_version` and include in answer cache key.
- Do NOT modify `governance.py`.
- Do NOT cache governance decisions — they must always be recomputed.

## ACCEPTANCE
- Unit tests pass.
- Manual: same query twice; second call has Azure embedding mock NOT called.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
