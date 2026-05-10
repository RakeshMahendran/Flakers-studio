# Branch: feat/wp-dynamic-html-fallback
**Worktree:** `E:\FS-dynamic-html`
**Phase:** 1 — Backend metadata + prompts
**Depends on:** rich-metadata (merge first to avoid file conflict on `wordpress_client.py`)

---

You are in worktree FS-dynamic-html on branch feat/wp-dynamic-html-fallback.

## GOAL
When a WordPress item's `content.rendered` AND ACF fields are both empty (page-builder pages like Elementor), fall back to fetching the public URL and parsing HTML. TVSSCS recovered ~102 missing pages this way.

## READ FIRST
1. `backend/ingestion/wordpress_client.py` — especially `_wp_item_to_scraped_page` (line 410) and `extract_wp_text` (line 106)
2. `backend/ingestion/web_scraper.py` — for HTML parsing patterns already in use

## DELIVERABLES

### 1. New function in `wordpress_client.py`
```python
async def _fetch_html_fallback(client, url) -> str
```
- Fetch the URL via the same `httpx.AsyncClient`
- Parse with BeautifulSoup
- Strip `_STRIP_TAGS` (already defined at line 72)
- Try selectors in order, pick one with most text:
  `'main', 'article', '[role="main"]', '#content', '.entry-content', '.site-content', 'body'`
- Return cleaned text via `clean_wp_html`
- Return `""` on any failure (don't raise)

### 2. Modify `_wp_item_to_scraped_page` (line 410)
- Call `extract_wp_text(item)` as today
- If result is shorter than 50 chars, attempt `_fetch_html_fallback` using item's link URL
- If fallback returns ≥50 chars, use it; tag the `ScrapedPage` metadata with `extraction_method="html_fallback"`
- Track stats: add `html_fallback_used: int` to `WordPressFetchStats` and increment

### 3. Add a config knob in `WordPressConfig`
```python
enable_html_fallback: bool = True
max_html_fallback_pages: int = 50  # cap so a broken site can't burn 1000 fetches
```

### 4. Tests
Extend `tests/backend/unit/test_wordpress_client.py` (create if absent):
- Mock httpx; item with empty content + empty ACF triggers fallback
- Mock returns HTML with `<main>...</main>`; assert text extracted
- Cap respected when `max_html_fallback_pages` reached

## CONSTRAINTS
- Do NOT use Selenium here — httpx + BeautifulSoup only. Selenium is for js-heavy sites; this is a static HTML fallback.
- Do NOT touch `rag_pipeline.py` or `governance.py`.
- Respect existing `self.config.delay_between_requests` between fallback fetches.

## ACCEPTANCE
- New unit tests pass.
- Manual smoke: point at any Elementor-built WordPress site, confirm previously-empty pages now have content.

## DO NOT
- Do NOT commit or push.
- Do NOT modify `governance.py`.

Stop before committing.
