"""
WordPress REST API Client for FlakersStudio

Fetches content from WordPress sites via the WP REST API (wp-json/wp/v2).
Supports posts, pages, custom post types, media, and WooCommerce products.
Adapted from TVS Sidekick's wordpress_url_scraper and intranet_api_data_fetcher.
"""
from __future__ import annotations

import hashlib
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from backend.ingestion.metadata_extractor import extract_metadata
from backend.ingestion.web_scraper import ScrapedPage

logger = logging.getLogger(__name__)

# Default WordPress REST API endpoints (relative to site root).
WP_ENDPOINTS: List[Dict[str, Any]] = [
    {"name": "Pages", "path": "/wp-json/wp/v2/pages", "paginated": True, "content_type": "page"},
    {"name": "Posts", "path": "/wp-json/wp/v2/posts", "paginated": True, "content_type": "post"},
]

# Optional endpoints probed only when detected.
WP_OPTIONAL_ENDPOINTS: List[Dict[str, Any]] = [
    {"name": "Products", "path": "/wp-json/wc/v3/products", "paginated": True, "content_type": "product"},
    {"name": "Media", "path": "/wp-json/wp/v2/media", "paginated": True, "content_type": "media"},
    {"name": "Categories", "path": "/wp-json/wp/v2/categories", "paginated": True, "content_type": "category"},
]


@dataclass
class WordPressConfig:
    """Configuration for WordPress REST API fetching."""

    per_page: int = 100
    max_pages: int = 50
    request_timeout: int = 30
    delay_between_requests: float = 0.5
    # Optional basic-auth credentials (user application password).
    username: str = ""
    password: str = ""
    # If True, also probe WooCommerce and media endpoints.
    probe_optional_endpoints: bool = True


@dataclass
class WordPressFetchStats:
    """Statistics collected during a WordPress fetch run."""

    api_calls: int = 0
    total_items: int = 0
    pages_fetched: int = 0
    posts_fetched: int = 0
    products_fetched: int = 0
    media_fetched: int = 0
    failed_endpoints: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# HTML cleaning helpers (adapted from TVS Sidekick HTMLContentExtractor)
# ---------------------------------------------------------------------------

_STRIP_TAGS = {"script", "style", "iframe", "noscript", "svg", "canvas", "video", "audio"}
_WP_NOISE_SELECTORS = [".wp-block-embed", ".video-thumb", ".modal", ".single-video-icon"]


def clean_wp_html(html_text: str) -> str:
    """Extract clean text from WordPress HTML content."""
    if not html_text or not isinstance(html_text, str):
        return ""
    if "<" not in html_text:
        return html_text.strip()
    try:
        soup = BeautifulSoup(html_text, "html.parser")
        for tag in soup(_STRIP_TAGS):
            tag.decompose()
        for selector in _WP_NOISE_SELECTORS:
            for elem in soup.select(selector):
                elem.decompose()
        text = soup.get_text(separator=" ", strip=True)
        text = re.sub(r"\s+", " ", text)
        return text.strip()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", html_text)
        return re.sub(r"\s+", " ", text).strip()


def _rendered(obj: Any) -> str:
    """Safely extract `.rendered` from a WordPress field that may be a dict or str."""
    if isinstance(obj, dict):
        return obj.get("rendered", "")
    if isinstance(obj, str):
        return obj
    return ""


def extract_wp_text(item: Dict[str, Any]) -> str:
    """Extract meaningful text from a single WordPress REST API item.

    Handles posts, pages, media, and products.  Returns cleaned plaintext.
    """
    parts: List[str] = []

    # Title
    title = clean_wp_html(_rendered(item.get("title", "")))
    if title:
        parts.append(title)

    # Main content
    content = clean_wp_html(_rendered(item.get("content", "")))
    if content and len(content) > 20:
        parts.append(content)

    # Excerpt (skip if duplicate of content)
    excerpt = clean_wp_html(_rendered(item.get("excerpt", "")))
    if excerpt and len(excerpt) > 10 and (not content or excerpt not in content):
        parts.append(excerpt)

    # Description (media items)
    desc = clean_wp_html(_rendered(item.get("description", "")))
    if desc and len(desc) > 20:
        parts.append(desc)

    # Caption (media items)
    caption = clean_wp_html(_rendered(item.get("caption", "")))
    if caption and len(caption) > 5:
        parts.append(caption)

    # Alt text (images)
    alt = item.get("alt_text", "")
    if alt and isinstance(alt, str) and len(alt) > 5:
        parts.append(alt)

    # ACF custom fields (if present)
    acf = item.get("acf")
    if acf and isinstance(acf, dict):
        acf_text = _extract_acf_text(acf)
        if acf_text:
            parts.append(acf_text)

    # WooCommerce product fields
    if "short_description" in item:
        short_desc = clean_wp_html(item["short_description"] or "")
        if short_desc:
            parts.append(short_desc)
    if "price_html" in item:
        price = clean_wp_html(item["price_html"] or "")
        if price:
            parts.append(f"Price: {price}")

    return "\n\n".join(parts)


# ACF custom fields ---------------------------------------------------------

_ACF_SKIP = {
    "_acf_changed", "field_", "id", "post_author", "post_date",
    "post_status", "comment_status", "post_password", "post_name",
    "post_modified", "guid", "menu_order", "post_type", "post_mime_type",
    "filter", "sizes", "width", "height", "filesize",
}


def _extract_acf_text(data: Dict[str, Any], depth: int = 0) -> str:
    """Recursively extract text from WordPress ACF fields."""
    if depth > 4 or not isinstance(data, dict):
        return ""
    parts: List[str] = []
    for key, value in data.items():
        if not value:
            continue
        key_lower = key.lower()
        if any(s in key_lower for s in _ACF_SKIP):
            continue
        if isinstance(value, str):
            clean = clean_wp_html(value)
            if clean and len(clean) > 5:
                parts.append(f"{key}: {clean}")
        elif isinstance(value, dict):
            if "rendered" in value:
                rendered = clean_wp_html(value["rendered"])
                if rendered:
                    parts.append(f"{key}: {rendered}")
            else:
                nested = _extract_acf_text(value, depth + 1)
                if nested:
                    parts.append(nested)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    clean = clean_wp_html(item)
                    if clean and len(clean) > 5:
                        parts.append(f"{key}: {clean}")
                elif isinstance(item, dict):
                    nested = _extract_acf_text(item, depth + 1)
                    if nested:
                        parts.append(nested)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Core WordPress client
# ---------------------------------------------------------------------------


def _item_url(item: Dict[str, Any], site_url: str) -> str:
    """Resolve the public URL for a WordPress item."""
    link = item.get("link") or item.get("source_url") or item.get("guid", {})
    if isinstance(link, dict):
        link = link.get("rendered", "")
    if link:
        return str(link)
    slug = item.get("slug", "")
    if slug:
        return urljoin(site_url.rstrip("/") + "/", slug)
    return site_url


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class WordPressClient:
    """Async client that fetches content from a WordPress site via its REST API.

    Usage::

        client = WordPressClient("https://example.com", config=WordPressConfig())
        pages = await client.fetch_all()
    """

    def __init__(
        self,
        site_url: str,
        config: Optional[WordPressConfig] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.site_url = site_url.rstrip("/")
        self.config = config or WordPressConfig()
        self.progress_callback = progress_callback
        self.stats = WordPressFetchStats()
        self._seen_hashes: Set[str] = set()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def fetch_all(self) -> List[ScrapedPage]:
        """Fetch all content from the WordPress site.

        Returns a list of ``ScrapedPage`` objects compatible with the rest
        of the FlakersStudio ingestion pipeline.
        """
        all_pages: List[ScrapedPage] = []

        auth = None
        if self.config.username and self.config.password:
            auth = httpx.BasicAuth(self.config.username, self.config.password)

        async with httpx.AsyncClient(
            timeout=self.config.request_timeout,
            auth=auth,
            follow_redirects=True,
            headers={"User-Agent": "FlakersStudio/1.0 (+https://flakers.studio)"},
        ) as client:
            # 1. Detect WP REST API availability
            if not await self._probe_rest_api(client):
                logger.warning("WordPress REST API not detected at %s", self.site_url)
                return []

            # 2. Fetch core endpoints (pages + posts)
            for ep in WP_ENDPOINTS:
                pages = await self._fetch_endpoint(client, ep)
                all_pages.extend(pages)

            # 3. Optionally probe WooCommerce / media / categories
            if self.config.probe_optional_endpoints:
                for ep in WP_OPTIONAL_ENDPOINTS:
                    if await self._endpoint_exists(client, ep["path"]):
                        pages = await self._fetch_endpoint(client, ep)
                        all_pages.extend(pages)

        logger.info(
            "WordPress fetch complete: %d items (%d API calls, %d failed endpoints)",
            len(all_pages),
            self.stats.api_calls,
            len(self.stats.failed_endpoints),
        )
        return all_pages

    async def detect_wordpress(self) -> bool:
        """Quick check — is this site running WordPress?"""
        async with httpx.AsyncClient(
            timeout=10, follow_redirects=True,
            headers={"User-Agent": "FlakersStudio/1.0"},
        ) as client:
            return await self._probe_rest_api(client)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _probe_rest_api(self, client: httpx.AsyncClient) -> bool:
        """Check if /wp-json/ returns a valid WordPress REST API root."""
        url = f"{self.site_url}/wp-json/"
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict) and ("namespaces" in data or "name" in data):
                    logger.info("WordPress REST API confirmed at %s", url)
                    return True
        except Exception as exc:
            logger.debug("REST API probe failed for %s: %s", url, exc)
        return False

    async def _endpoint_exists(self, client: httpx.AsyncClient, path: str) -> bool:
        """HEAD-check whether an optional endpoint exists (avoids full fetch)."""
        url = f"{self.site_url}{path}?per_page=1"
        try:
            resp = await client.get(url)
            return resp.status_code == 200
        except Exception:
            return False

    async def _fetch_endpoint(
        self,
        client: httpx.AsyncClient,
        endpoint: Dict[str, Any],
    ) -> List[ScrapedPage]:
        """Fetch all items from one WordPress REST API endpoint."""
        ep_name = endpoint["name"]
        path = endpoint["path"]
        paginated = endpoint.get("paginated", True)
        content_type = endpoint.get("content_type", "page")

        results: List[ScrapedPage] = []
        page = 1

        logger.info("Fetching WordPress %s from %s%s", ep_name, self.site_url, path)

        while True:
            url = f"{self.site_url}{path}"
            params: Dict[str, Any] = {"per_page": self.config.per_page}
            if paginated:
                params["page"] = page

            try:
                resp = await client.get(url, params=params)
                self.stats.api_calls += 1

                if resp.status_code != 200:
                    if page == 1:
                        self.stats.failed_endpoints.append(ep_name)
                        logger.warning("Endpoint %s returned %d", ep_name, resp.status_code)
                    break

                data = resp.json()
                if not data:
                    break

                items = data if isinstance(data, list) else [data]
                for item in items:
                    scraped = self._wp_item_to_scraped_page(item, content_type)
                    if scraped:
                        results.append(scraped)

                self._emit_progress(ep_name, page, len(results))

                if not paginated:
                    break

                total_pages = int(resp.headers.get("X-WP-TotalPages", "1"))
                if page >= total_pages or page >= self.config.max_pages:
                    break

                page += 1
                time.sleep(self.config.delay_between_requests)

            except Exception as exc:
                logger.error("Error fetching %s page %d: %s", ep_name, page, exc)
                if page == 1:
                    self.stats.failed_endpoints.append(ep_name)
                break

        # Update stats
        count = len(results)
        self.stats.total_items += count
        if content_type == "page":
            self.stats.pages_fetched += count
        elif content_type == "post":
            self.stats.posts_fetched += count
        elif content_type == "product":
            self.stats.products_fetched += count
        elif content_type == "media":
            self.stats.media_fetched += count

        logger.info("Fetched %d %s items from %s", count, content_type, ep_name)
        return results

    def _wp_item_to_scraped_page(
        self, item: Dict[str, Any], content_type: str
    ) -> Optional[ScrapedPage]:
        """Convert a single WP REST API item to a ScrapedPage."""
        text = extract_wp_text(item)
        if not text or len(text.strip()) < 50:
            return None

        # Dedup by content hash
        chash = _content_hash(text)
        if chash in self._seen_hashes:
            return None
        self._seen_hashes.add(chash)

        url = _item_url(item, self.site_url)
        title_raw = item.get("title", "")
        title = clean_wp_html(_rendered(title_raw)) or url.split("/")[-1]

        # Extract links from HTML content
        links: List[str] = []
        content_html = _rendered(item.get("content", ""))
        if content_html:
            try:
                soup = BeautifulSoup(content_html, "html.parser")
                links = [a["href"] for a in soup.find_all("a", href=True)]
            except Exception:
                pass

        # Rich metadata (date, categories, ACF event fields, …) for downstream
        # filtered retrieval. Failure here must never break ingestion.
        try:
            extracted = extract_metadata(item, content_type, url)
        except Exception as exc:  # pragma: no cover — defensive
            # Log at WARNING level with context for production debugging
            item_id = item.get("id", "unknown")
            acf_keys = list(item.get("acf", {}).keys()) if isinstance(item.get("acf"), dict) else []
            logger.warning(
                "Metadata extraction failed for %s (WP ID: %s, ACF keys: %s): %s",
                url, item_id, acf_keys, exc,
                exc_info=True,
            )
            extracted = {}

        return ScrapedPage(
            url=url,
            title=title,
            content=text,
            meta_description=clean_wp_html(_rendered(item.get("excerpt", "")))[:300],
            links=links,
            images=[item.get("source_url", "")] if item.get("source_url") else [],
            content_type=content_type,
            scraped_at=datetime.utcnow(),
            content_hash=chash,
            extracted_metadata=extracted,
        )

    def _emit_progress(self, endpoint_name: str, page: int, total_so_far: int) -> None:
        if self.progress_callback:
            try:
                self.progress_callback({
                    "event_type": "wordpress_fetch",
                    "endpoint": endpoint_name,
                    "page": page,
                    "items_fetched": total_so_far,
                })
            except Exception:
                pass
