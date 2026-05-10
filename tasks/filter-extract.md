# Branch: feat/llm-filter-extraction
**Worktree:** `E:\FS-filter-extract`
**Phase:** 2 — RAG quality
**Depends on:** rich-metadata (must be merged first)
**Shared file:** `rag_pipeline.py` — coordinate merge order with rerank-boost and prompt-upgrade

---

You are in worktree FS-filter-extract on branch feat/llm-filter-extraction.

## GOAL
Before semantic search, ask a cheap LLM (gpt-4o-mini or whatever cheap model is configured) to extract structured metadata filters from the query. Pass those to Qdrant. If filtered search returns nothing, fall back to unfiltered semantic.

## READ FIRST
1. `backend/retrieval/rag_pipeline.py` — current retrieval flow
2. `backend/services/azure_ai.py` — Azure client
3. `backend/vector_providers/qdrant_provider.py` — Qdrant search interface; check filter syntax support
4. `backend/ingestion/metadata_extractor.py` — read this if the rich-metadata branch has merged. Otherwise check the schema being planned (year, month, category_ids, tag_ids, event_year, is_upcoming, document_type, fiscal_year, quarter)

## DELIVERABLES

### 1. New file: `backend/retrieval/filter_extractor.py`
Class: `FilterExtractor`
- `async def extract(query: str, assistant_metadata_schema: dict) -> FilterResult`
- `FilterResult` dataclass: `{ filters: dict, intent: str, confidence: str, needs_aggregation: bool }`

Use the cheapest available Azure deployment (configurable via settings). System prompt should:
- Inject `CURRENT DATE`
- List available filter fields (driven by `assistant_metadata_schema`)
- Return JSON only (no markdown fences)
- Few-shot examples for: temporal ("last year"), category ("events in 2024"), no-filter ("who is the CEO")

### 2. Wire into `rag_pipeline.py`
- In parallel with query embedding (use `asyncio.gather`), call `FilterExtractor.extract`
- Pass filters to Qdrant search as a payload filter (use `qdrant_client.models.Filter / FieldCondition`)
- If filtered search returns 0 hits, retry with empty filter (semantic only) and tag the response metadata with `used_fallback: true`

### 3. Settings
Add settings field: `settings.FILTER_EXTRACTION_MODEL` (default to the cheap model). Off-switch: `settings.ENABLE_FILTER_EXTRACTION = True`.

### 4. Tests
`tests/backend/unit/test_filter_extractor.py` — mock Azure, assert correct filters extracted for sample queries. Use respx or `unittest.mock`.

### 5. Eval comparison
Run `tests/eval/runner.py` before and after to compare scores. Save both reports to `tests/eval/reports/`. Include the diff in your final report to the user.

## CONSTRAINTS
- Run embed + filter extraction in PARALLEL — total latency added must be ≤ max(embed_time, filter_time), not their sum.
- Cache filter extraction results in-memory per query (LRU 256) — same query won't hit LLM twice within a session.
- Do NOT change `governance.py` or the rerank step (different branch).
- If Qdrant doesn't support a filter field (e.g., the metadata schema isn't merged yet), DEGRADE gracefully — log a warning, skip the filter, do semantic-only.

## ACCEPTANCE
- Unit tests pass.
- `tests/eval/runner.py` shows non-regression vs baseline.
- Verify a temporal query ("events from 2024") produces a Qdrant call with filter clause via debug log.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing. Report eval-suite delta to the user.
