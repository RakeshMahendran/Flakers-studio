"""Unit tests for backend.ingestion.wordpress_client HTML fallback path.

Covers:
- ``_fetch_html_fallback`` selector ranking + failure handling.
- ``WordPressClient._wp_item_to_scraped_page`` triggering fallback when
  the REST item text is empty.
- ``max_html_fallback_pages`` cap is honoured.
- ``enable_html_fallback=False`` disables the path entirely.
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ingestion.wordpress_client import (
    WordPressClient,
    WordPressConfig,
    _HTML_FALLBACK_SELECTORS,
    _MIN_TEXT_LEN,
    _fetch_html_fallback,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, text: str = "", status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code


class _FakeAsyncClient:
    """Minimal stand-in for ``httpx.AsyncClient`` used by the fallback.

    Records every URL it was asked to GET so tests can assert call counts
    and ordering. ``responses`` maps URL -> ``_FakeResponse``; missing
    URLs raise — that exercises the swallow-all-errors guard.
    """

    def __init__(self, responses: Dict[str, _FakeResponse]) -> None:
        self.responses = responses
        self.calls: List[str] = []

    async def get(self, url: str, params: Optional[Dict[str, Any]] = None):
        self.calls.append(url)
        if url not in self.responses:
            raise RuntimeError(f"unexpected URL: {url}")
        return self.responses[url]


def _run(coro):
    return asyncio.run(coro)


# Sample Elementor-ish HTML where <main> has the real content and the
# rest of the page is generic chrome / noise.
_ELEMENTOR_HTML = """
<html>
  <head><title>About Us</title></head>
  <body>
    <header><nav>Home About Contact</nav></header>
    <main>
      <h1>About Our Studio</h1>
      <p>We craft beautiful WordPress sites with Elementor and care
         deeply about accessibility and performance.</p>
      <p>This page exists to be discovered by the HTML fallback.</p>
    </main>
    <footer>Copyright 2024</footer>
  </body>
</html>
"""


# Item shape that ``extract_wp_text`` will reduce to "" or near-empty —
# triggers fallback.
def _empty_wp_page_item(idx: int = 1) -> Dict[str, Any]:
    return {
        "id": idx,
        "type": "page",
        "slug": f"page-{idx}",
        "link": f"https://example.com/page-{idx}/",
        "title": {"rendered": "About Us"},
        "content": {"rendered": ""},
        "excerpt": {"rendered": ""},
        "acf": {},
    }


# ---------------------------------------------------------------------------
# _fetch_html_fallback
# ---------------------------------------------------------------------------


class FetchHtmlFallbackTests(unittest.TestCase):
    def test_extracts_main_content_text(self):
        client = _FakeAsyncClient(
            {"https://example.com/page-1/": _FakeResponse(_ELEMENTOR_HTML)}
        )
        text = _run(_fetch_html_fallback(client, "https://example.com/page-1/"))
        # The actual page content must come through.
        self.assertIn("About Our Studio", text)
        self.assertIn("Elementor", text)
        self.assertIn("HTML fallback", text)
        # Length must comfortably clear the 50-char rescue threshold.
        self.assertGreaterEqual(len(text), _MIN_TEXT_LEN)

    def test_main_selector_preferred_when_body_only_wraps_chrome(self):
        # When <main> is the dominant text region (body adds only minor
        # chrome), the "most text" rule still surfaces the real content
        # without the chrome noise inflating body's length disproportionately.
        html = """
        <html>
          <body>
            <header><nav>x</nav></header>
            <main>
              <h1>Article Title</h1>
              <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                 Sed do eiusmod tempor incididunt ut labore et dolore magna
                 aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p>
            </main>
            <footer>x</footer>
          </body>
        </html>
        """
        client = _FakeAsyncClient({"https://x/": _FakeResponse(html)})
        text = _run(_fetch_html_fallback(client, "https://x/"))
        self.assertIn("Lorem ipsum", text)
        self.assertIn("Article Title", text)

    def test_returns_empty_on_non_200(self):
        client = _FakeAsyncClient(
            {"https://example.com/x/": _FakeResponse("doesn't matter", status_code=404)}
        )
        text = _run(_fetch_html_fallback(client, "https://example.com/x/"))
        self.assertEqual(text, "")

    def test_returns_empty_on_network_exception(self):
        # No URL registered -> _FakeAsyncClient raises -> guard returns "".
        client = _FakeAsyncClient({})
        text = _run(_fetch_html_fallback(client, "https://example.com/missing/"))
        self.assertEqual(text, "")

    def test_strip_tags_removes_script_and_style(self):
        html = """
        <html><body>
          <script>var leak='SHOULD_NOT_APPEAR';</script>
          <style>.x { color: red; }</style>
          <main>
            <p>Real content lives here and should pass the 50-char threshold easily.</p>
          </main>
        </body></html>
        """
        client = _FakeAsyncClient({"https://x/": _FakeResponse(html)})
        text = _run(_fetch_html_fallback(client, "https://x/"))
        self.assertIn("Real content lives here", text)
        self.assertNotIn("SHOULD_NOT_APPEAR", text)
        self.assertNotIn("color: red", text)

    def test_empty_url_returns_empty_without_fetch(self):
        client = _FakeAsyncClient({})
        text = _run(_fetch_html_fallback(client, ""))
        self.assertEqual(text, "")
        self.assertEqual(client.calls, [])

    def test_selector_order_is_documented(self):
        # The selector list is part of the contract — keep it stable.
        self.assertEqual(
            _HTML_FALLBACK_SELECTORS,
            [
                "main",
                "article",
                '[role="main"]',
                "#content",
                ".entry-content",
                ".site-content",
                "body",
            ],
        )


# ---------------------------------------------------------------------------
# WordPressClient._wp_item_to_scraped_page integration
# ---------------------------------------------------------------------------


class WpItemFallbackIntegrationTests(unittest.TestCase):
    def _make_client(self, **cfg_overrides) -> WordPressClient:
        # delay=0 so tests don't actually sleep.
        cfg = WordPressConfig(delay_between_requests=0.0, **cfg_overrides)
        return WordPressClient("https://example.com", config=cfg)

    def test_empty_item_triggers_fallback_and_extracts_html(self):
        client = self._make_client()
        item = _empty_wp_page_item(1)

        fake_http = _FakeAsyncClient(
            {"https://example.com/page-1/": _FakeResponse(_ELEMENTOR_HTML)}
        )
        scraped = _run(client._wp_item_to_scraped_page(fake_http, item, "page"))

        self.assertIsNotNone(scraped)
        assert scraped is not None  # for type-checker
        self.assertIn("About Our Studio", scraped.content)
        self.assertEqual(
            scraped.extracted_metadata.get("extraction_method"), "html_fallback"
        )
        self.assertEqual(client.stats.html_fallback_used, 1)
        # Polite delay was awaited (delay=0 so just a single call recorded).
        self.assertEqual(fake_http.calls, ["https://example.com/page-1/"])

    def test_non_empty_item_does_not_trigger_fallback(self):
        client = self._make_client()
        item = {
            "id": 2,
            "type": "page",
            "link": "https://example.com/full/",
            "title": {"rendered": "Real Title"},
            "content": {
                "rendered": (
                    "<p>This is a meaningful paragraph that exceeds fifty characters "
                    "of cleaned content easily.</p>"
                )
            },
            "excerpt": {"rendered": ""},
        }

        fake_http = _FakeAsyncClient({})  # any GET would raise
        scraped = _run(client._wp_item_to_scraped_page(fake_http, item, "page"))

        self.assertIsNotNone(scraped)
        assert scraped is not None
        self.assertNotIn(
            "extraction_method", scraped.extracted_metadata,
            "REST-only items must NOT be tagged as html_fallback",
        )
        self.assertEqual(client.stats.html_fallback_used, 0)
        self.assertEqual(fake_http.calls, [])

    def test_fallback_short_html_still_returns_none(self):
        # If even the HTML page yields < 50 chars, no ScrapedPage is built
        # and the fallback counter does NOT advance.
        client = self._make_client()
        item = _empty_wp_page_item(3)

        fake_http = _FakeAsyncClient({
            "https://example.com/page-3/": _FakeResponse(
                "<html><body><main>tiny</main></body></html>"
            )
        })
        scraped = _run(client._wp_item_to_scraped_page(fake_http, item, "page"))
        self.assertIsNone(scraped)
        self.assertEqual(client.stats.html_fallback_used, 0)

    def test_max_html_fallback_pages_cap_is_respected(self):
        # Cap = 2: the third empty item must skip the fetch entirely.
        client = self._make_client(max_html_fallback_pages=2)

        # Each page returns *distinct* content so dedup doesn't mask the cap.
        def _html(idx: int) -> str:
            return f"""
            <html><body><main>
              <h1>Unique Page {idx}</h1>
              <p>Content body number {idx} that easily clears fifty
                 characters of cleaned text for the rescue threshold.</p>
            </main></body></html>
            """

        responses = {
            f"https://example.com/page-{i}/": _FakeResponse(_html(i))
            for i in range(1, 5)
        }
        fake_http = _FakeAsyncClient(responses)

        results = []
        for i in range(1, 5):
            item = _empty_wp_page_item(i)
            results.append(_run(client._wp_item_to_scraped_page(fake_http, item, "page")))

        # First two succeed via fallback; remaining two must return None
        # because the cap was already hit (and no HTTP call was made).
        self.assertIsNotNone(results[0])
        self.assertIsNotNone(results[1])
        self.assertIsNone(results[2])
        self.assertIsNone(results[3])

        self.assertEqual(client.stats.html_fallback_used, 2)
        # Only the first two URLs should have been fetched.
        self.assertEqual(
            fake_http.calls,
            [
                "https://example.com/page-1/",
                "https://example.com/page-2/",
            ],
        )

    def test_enable_html_fallback_false_disables_path(self):
        client = self._make_client(enable_html_fallback=False)
        item = _empty_wp_page_item(7)

        # If the fallback is even attempted, this would raise.
        fake_http = _FakeAsyncClient({})
        scraped = _run(client._wp_item_to_scraped_page(fake_http, item, "page"))

        self.assertIsNone(scraped)
        self.assertEqual(client.stats.html_fallback_used, 0)
        self.assertEqual(fake_http.calls, [])

    def test_min_text_threshold_is_fifty(self):
        # Lock the threshold so a future tweak triggers a test failure
        # rather than a silent behaviour change.
        self.assertEqual(_MIN_TEXT_LEN, 50)


if __name__ == "__main__":
    unittest.main()
