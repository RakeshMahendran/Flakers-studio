# Branch: feat/pdf-document-ingestion
**Worktree:** `E:\FS-pdf-ingest`
**Phase:** 3 — New content types
**Depends on:** rich-metadata + hybrid-chunking (both merged)

---

You are in worktree FS-pdf-ingest on branch feat/pdf-document-ingestion.

## GOAL
Add PDF ingestion (annual reports, quarterly results, policies, whitepapers). Auto-detect document type and extract `fiscal_year`/`quarter`/`report_year` metadata so financial queries route correctly.

## READ FIRST
1. `backend/ingestion/ingestion.py` — pipeline orchestration
2. `backend/ingestion/web_scraper.py` — `ScrapedPage` shape (we'll produce these)
3. `backend/ingestion/content_processor.py` — chunking
4. `backend/ingestion/metadata_extractor.py` if merged — schema we conform to

## DELIVERABLES

### 1. Dependency
Add to `server/requirements.txt`: `pypdf>=4.0` (NOT PyPDF2 — deprecated)

### 2. New file: `backend/ingestion/pdf_processor.py`
Function: `async def process_pdf(file_url_or_path: str, source_url: str) -> ScrapedPage`

Steps:
1. Download (httpx) or read local
2. Extract text page-by-page with pypdf
3. Detect document type via filename + first 500 chars (regex patterns below)
4. Extract metadata fields per type
5. Build `ScrapedPage` with `content_type="pdf"`, `extracted_metadata` populated

### 3. Document type detection patterns
```python
text = (filename + " " + first_500_chars).lower()
```

- **quarterly_results:** `re.search(r'\bq([1-4])\b', text)` AND any(x in text for x in ['fy', 'unaudited', 'financial result'])
  → `quarter=Q{1-4}, fiscal_year=FY{last2digits}, report_year=20{last2digits}`
- **annual_report:** `re.search(r'annual\s*report|ar[\s\-_]?20\d{2}', text)`
  → `fiscal_year, report_year`
- **gender_pay_gap:** `re.search(r'gender[\s\-_]?pay[\s\-_]?gap', text)`
  → `category="esg", report_year`
- **regulatory_disclosure:** `re.search(r'sebi|regulation[\s\-_]?\d+', text)`
- **policy:** `re.search(r'\bpolicy\b|terms[\s\-_]of[\s\-_]service', text)`
- **whitepaper:** `re.search(r'whitepaper|case[\s\-_]study', text)`
- **default:** `document_type="document"`

### 4. PDF-specific chunk handling
In `pdf_processor` or `content_processor`, when chunking PDF content, preserve the first detected table-header line in every chunk so financial table rows keep context. Detect table rows via pipe characters or columnar whitespace.

### 5. Wire into `ingestion.py`
When an ingestion job's source is a PDF URL or a discovered `.pdf` link, route to `pdf_processor` instead of `web_scraper`.

### 6. Discovery path
In `content_discovery.py`, when crawling, capture `.pdf` links into a separate queue.

### 7. Tests
`tests/backend/unit/test_pdf_processor.py`:
- Mock pypdf with sample text
- Filename "Q2-FY24-Unaudited.pdf" → `quarter="Q2", fiscal_year="FY24", report_year="2024"`
- Filename "Annual_Report_2023.pdf" → `document_type="annual_report"`
- Filename with no clear pattern → `document_type="document"`

### 8. CLI helper
`scripts/ingest_pdf.py` for one-off PDF testing.

## CONSTRAINTS
- PDF text quality is lumpy. Apply `is_corrupted_chunk` (from feat/hybrid-semantic-chunking if merged; otherwise inline the same check).
- Don't OCR. If pypdf returns <200 chars, log + skip the doc.
- Do NOT modify `governance.py`.
- Memory: stream pages, don't load 200-page PDFs whole if avoidable.

## ACCEPTANCE
- Unit tests pass.
- Manual ingest of a sample 10-page PDF produces chunks with correct `fiscal_year` metadata in Qdrant payload.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
