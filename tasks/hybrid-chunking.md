# Branch: feat/hybrid-semantic-chunking
**Worktree:** `E:\FS-hybrid-chunking`
**Phase:** 2 — RAG quality
**Depends on:** rich-metadata (merge first to avoid file conflict on `content_processor.py`)

---

You are in worktree FS-hybrid-chunking on branch feat/hybrid-semantic-chunking.

## GOAL
Replace fixed-token chunking with semantic chunking: embed sentences, find topic boundaries, group into 300-600 token chunks. Skip corrupted chunks (PDF extraction artifacts).

## READ FIRST
1. `backend/ingestion/content_processor.py` — especially `_chunk_text` (line 76) and `process_scraped_pages` (line 164)
2. `backend/services/azure_ai.py` — embedding client (you'll need it)
3. `backend/config/settings.py` — `MAX_CONTENT_LENGTH` and `CHUNK_OVERLAP`

## DELIVERABLES

### 1. New file: `backend/ingestion/semantic_chunker.py`
Class: `SemanticChunker`

Parameters:
- `target_min=300, target_max=600, overlap_tokens=100, similarity_threshold=0.5`

Method: `async def chunk(text: str) -> List[str]`

Algorithm:
1. Split text into sentences (use a regex; nltk is overkill)
2. Embed each sentence in batches via Azure embeddings (text-embedding-3-small is cheap)
3. Compute cosine similarity between adjacent sentences
4. Mark a boundary when similarity drops below threshold
5. Group consecutive sentences between boundaries into chunks
6. If a group exceeds 600 tokens, split it at the next boundary down
7. If a group is below 100 tokens, merge with neighbor
8. Add overlap of 100 tokens at each boundary (last 100 tokens of prev chunk prefix the next)

Return chunks as plain strings (token counting via tiktoken cl100k_base).

### 2. Corruption detection
Helper function `is_corrupted_chunk(text: str) -> bool` — Returns True if any of:
- `text.count('/uni') > 5` (Tamil/non-Latin extraction failure)
- `text.count('.notdef') > 2`
- `text.count('\\x00') > 0`
- `len(text.strip()) < 30`

Skip these chunks before embedding (don't waste tokens on garbage).

### 3. Modify `content_processor.py`
- Replace `_chunk_text` with a call to `SemanticChunker`
- Apply `is_corrupted_chunk` filter
- Add settings flag: `settings.USE_SEMANTIC_CHUNKING = True` (so users can revert to old chunker)

### 4. Tests
`tests/backend/unit/test_semantic_chunker.py`:
- Multi-paragraph article with 2 topics → 2 chunks
- Single short paragraph → 1 chunk
- Long monolithic paragraph → split at token cap
- Corrupted PDF text → all chunks dropped

### 5. Eval comparison
Run `tests/eval/runner.py` before/after; report delta.

## CONSTRAINTS
- Embeddings cost money. Add a per-page cap: if a page has >200 sentences, fall back to old fixed-token chunker (log warning).
- Cache embeddings in a local dict during a single ingest run (same sentence won't re-embed).
- Do NOT modify `governance.py`.
- Do NOT change Qdrant payload schema — only chunk text changes.

## ACCEPTANCE
- Unit tests pass.
- Eval suite delta neutral or positive.
- Manual ingest of a long article produces 5-20 chunks, not 1 giant or 50 tiny.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
