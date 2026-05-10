# Branch: feat/rich-metadata-extraction
**Worktree:** `E:\FS-rich-metadata`
**Phase:** 1 — Backend metadata + prompts
**Depends on:** Phase 0 (eval-suite merged)
**Blocks:** filter-extract, rerank-boost, pdf-ingest

---

You are in worktree FS-rich-metadata on branch feat/rich-metadata-extraction.

## GOAL
Extract rich metadata at ingestion time so future filtered retrieval works. The current pipeline drops WordPress fields like date, categories, tags, and event ACF data.

## READ FIRST
1. `backend/ingestion/wordpress_client.py` — especially `_wp_item_to_scraped_page` (line ~410) and `extract_wp_text` (line 106)
2. `backend/ingestion/content_processor.py` — especially `process_scraped_pages` (line 164) and `ContentChunk` dataclass (line 21)
3. `backend/ingestion/web_scraper.py` — `ScrapedPage` dataclass
4. `backend/models/content.py` and `backend/models/ingestion_tracking.py` — DB shape
5. `backend/vector_providers/qdrant_provider.py` — Qdrant payload upsert
6. `backend/ingestion/ingestion.py` — pipeline orchestration

## DELIVERABLES

### 1. New file: `backend/ingestion/metadata_extractor.py`
Function: `extract_metadata(item: dict, content_type: str, source_url: str) -> dict`

For WordPress items, extract:
- `year`, `month`, `date` (from `item['date']` ISO string)
- `post_id` (from `item['id']`)
- `type` (post|page|product|media)
- `category_ids: [str(c) for c in item.get('categories', [])]`
- `tag_ids: [str(t) for t in item.get('tags', [])]`
- `slug`, `author_id` (if present)

For events (when `item['acf']` contains `event_start_date` or category includes "event"):
- `event_start_date`, `event_end_date` (parse "YYYYMMDD" format → ISO)
- `event_year`, `event_month`
- `event_location` (cleaned, no `<br>`)
- `is_upcoming`: `event_start_date > today`

Return strings only (Pinecone/Qdrant payload prefers flat strings); no nested dicts.

### 2. Extend `ScrapedPage` in `backend/ingestion/web_scraper.py`
Add field: `extracted_metadata: Dict[str, Any] = field(default_factory=dict)`

### 3. Modify `wordpress_client.py:_wp_item_to_scraped_page` (line 410)
After extracting text, call `metadata_extractor.extract_metadata(item, content_type, url)` and assign to `ScrapedPage.extracted_metadata`.

### 4. Modify `content_processor.py:process_scraped_pages` (line 164)
When building each `ContentChunk`'s metadata dict, merge in `page.extracted_metadata`. Do NOT overwrite existing keys (`scraped_at`, `quality_score`, etc.).

### 5. Modify `backend/ingestion/ingestion.py` and Qdrant upsert path (`vector_providers/qdrant_provider.py`)
Ensure all `extracted_metadata` fields land in the Qdrant point payload (not just chunk text).

### 6. Migration
If `backend/models/ingestion_tracking.py` `IngestionChunk` has a metadata column, no schema change needed (it should be JSONB). If not, add an alembic migration.

### 7. Tests
`tests/backend/unit/test_metadata_extractor.py` covering:
- Standard post with date + categories
- Event page with ACF `event_start_date` in YYYYMMDD format
- Page with no metadata (graceful empty dict)
- `is_upcoming` computed correctly relative to today

## CONSTRAINTS
- Do NOT touch `rag_pipeline.py` (filter-extraction branch will use this metadata).
- Do NOT touch `governance.py`.
- All metadata values must be strings, ints, bools, or lists of strings — Qdrant payload friendly.
- Keep `is_upcoming` evaluation idempotent (call `datetime.utcnow().date()` at eval time, not at index time — store `event_date` as the canonical field).

## ACCEPTANCE
- New unit tests pass.
- A re-ingested test WordPress export shows new fields in Qdrant payload (verify with a one-off script).
- No regression in existing tests.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
