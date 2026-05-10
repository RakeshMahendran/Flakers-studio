# Branch: feat/rerank-and-factual-overrides
**Worktree:** `E:\FS-rerank-boost`
**Phase:** 2 — RAG quality
**Depends on:** rich-metadata + filter-extract (merge both first)
**Shared file:** `rag_pipeline.py` — last in the merge chain

---

You are in worktree FS-rerank-boost on branch feat/rerank-and-factual-overrides.

## GOAL
After Qdrant returns top-k, re-rank with: (1) recency boost for time-sensitive categories, (2) factual override for known entities (CEO, founders, addresses) — these should hit 100% accuracy.

## READ FIRST
1. `backend/retrieval/rag_pipeline.py` — find where Qdrant results are used to build LLM context
2. `backend/models/assistant.py` — assistant config shape; we'll add per-assistant override config
3. `backend/ingestion/metadata_extractor.py` if merged (for `category_ids`, `year` fields)

## DELIVERABLES

### 1. New file: `backend/retrieval/factual_overrides.py`
- Class: `FactualOverrideStore` (per-assistant or per-tenant)
- Load from a new optional column on `Assistant` model: `factual_overrides JSONB`
- Format: list of `{ trigger_keywords: [...], canonical_answer: str, source_url: str, confidence: 1.0, boost: 0.5 }`
- `def find_match(query: str, assistant_id: str) -> Optional[FactualOverride]` — Returns first override whose `trigger_keywords` all appear (lower-cased, word-boundary) in the query.

### 2. New file: `backend/retrieval/reranker.py`
Function: `rerank(hits: List[Hit], query: str, override: Optional[FactualOverride]) -> List[Hit]`

Scoring: `new_score = base_score * recency_weight * override_boost`

**recency_weight:** for hits with metadata category in `{press, events, blog, news}`, apply:
- 1.2 if within 1 year
- 1.0 if 1-2y
- 0.85 if 2-5y
- 0.7 if older
- 1.0 if no date

**override_boost:** if hit's `source_url` matches `override.source_url`, multiply by `(1 + override.boost)`. Otherwise 1.0.

**Factual fast path:** if override matched AND no hit's score (post-boost) ≥ 0.9, prepend a synthetic hit using `override.canonical_answer` with score=1.0.

### 3. Wire into `rag_pipeline.py`
- After Qdrant returns hits, call `factual_overrides.find_match`
- Pass hits + override to `reranker.rerank`
- Use the reranked list for context assembly

### 4. Migration
Add `factual_overrides` JSONB column to `Assistant`. Default empty list.

### 5. Admin endpoint (optional)
`backend/api/routes/assistant.py` — GET/PUT `/assistants/{id}/factual-overrides` (can be done in a follow-up).

### 6. Tests
- `tests/backend/unit/test_reranker.py`:
  - Recency: 2024 hit > 2020 hit on same query
  - Override match: synthetic hit prepended when no organic match scores high
  - Override no-match: returns hits in original order with recency only
- `tests/backend/unit/test_factual_overrides.py`

### 7. Eval comparison
Run `tests/eval/runner.py` before/after; report delta on factual queries.

## CONSTRAINTS
- Re-ranking is post-Qdrant — does NOT change what Qdrant searches.
- Recency boost fires ONLY for time-sensitive categories — don't apply to docs/policy.
- Do NOT modify `governance.py`. The reranked list still goes through governance evaluation.
- `factual_overrides.canonical_answer` becomes a "synthetic context chunk" — make sure governance recognizes it as ATTRIBUTED (carry source_url).

## ACCEPTANCE
- Unit tests pass.
- Eval suite: factual category (e.g., "who is the CEO") scores ≥95% with overrides loaded.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
