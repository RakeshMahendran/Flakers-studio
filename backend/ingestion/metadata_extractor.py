"""
Rich metadata extraction for ingested content.

Extracts structured fields (year, month, categories, tags, event ACF data)
from WordPress REST API items and stores them as a flat dict suitable for
Qdrant payloads.

Design notes:
    * All values are flat: ``str``, ``int``, ``bool``, or ``list[str]``.
      No nested dicts — Qdrant payload friendly.
    * ``is_upcoming`` is intentionally NOT stored at index time. It is
      time-relative and would be stale the moment we wrote it. Consumers
      compute it on demand via :func:`compute_is_upcoming` against the
      stored canonical ``event_start_date``.
    * Designed to be defensive: a malformed item must never raise — return
      whatever could be extracted (possibly an empty dict).
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_WS_RE = re.compile(r"\s+")
_YYYYMMDD_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})$")
_ISO_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def _clean_inline(text: Any) -> str:
    """Strip HTML tags (notably ``<br>``) from a short inline string."""
    if text is None:
        return ""
    if not isinstance(text, str):
        text = str(text)
    if not text:
        return ""
    text = _BR_RE.sub(" ", text)
    if "<" in text:
        try:
            text = BeautifulSoup(text, "html.parser").get_text(separator=" ", strip=True)
        except Exception:
            text = re.sub(r"<[^>]+>", " ", text)
    return _WS_RE.sub(" ", text).strip()


def _parse_iso_date(value: str) -> Optional[date]:
    """Best-effort ISO-8601 date parse. Returns ``None`` on failure."""
    if not value or not isinstance(value, str):
        return None
    # WordPress dates often look like "2024-03-15T10:00:00" — split off time.
    head = value.split("T", 1)[0]
    m = _ISO_DATE_RE.match(head)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except (ValueError, TypeError):
        return None


def _parse_event_date(value: Any) -> Optional[date]:
    """Parse an event date stored either as ``YYYYMMDD`` or ISO ``YYYY-MM-DD``.

    The TVS Sidekick recovery work showed events typically use the compact
    ``YYYYMMDD`` form in ACF fields, but a few use ISO. Accept both.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        value = str(int(value))
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None

    m = _YYYYMMDD_RE.match(value)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except (ValueError, TypeError):
            return None
    return _parse_iso_date(value)


def _stringify_id_list(values: Any) -> List[str]:
    """Coerce a list of WP ID-ish values into a list of strings (sorted, dedup)."""
    if not isinstance(values, list):
        return []
    out: List[str] = []
    seen: set = set()
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _looks_like_event(item: Dict[str, Any], acf: Dict[str, Any]) -> bool:
    """Heuristic: does this WP item describe an event?

    Two signals — either is sufficient:
      1. ACF has any ``event_start_date``-shaped field.
      2. The item's content_type / categories slug contains "event".
    """
    if "event_start_date" in acf or "event_date" in acf or "start_date" in acf:
        return True

    # Some sites attach an "event_categories" array of dicts/strings.
    cats = item.get("event_categories") or item.get("categories_list") or []
    if isinstance(cats, list):
        for c in cats:
            if isinstance(c, str) and "event" in c.lower():
                return True
            if isinstance(c, dict):
                slug = str(c.get("slug") or c.get("name") or "").lower()
                if "event" in slug:
                    return True

    item_type = str(item.get("type", "")).lower()
    if "event" in item_type:
        return True

    return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_metadata(
    item: Dict[str, Any],
    content_type: str,
    source_url: str,
) -> Dict[str, Any]:
    """Extract a flat metadata dict from a WordPress REST API item.

    Args:
        item: Raw WP REST item (post / page / product / media).
        content_type: Caller-provided content type tag (``post``, ``page``, …).
        source_url: Public URL the item resolves to (used as a fallback only).

    Returns:
        A flat dict whose values are ``str``, ``int``, ``bool``, or
        ``list[str]``. Always a dict — never ``None`` — but may be empty
        when the item lacks any extractable metadata.
    """
    if not isinstance(item, dict) or not item:
        # Truly empty input → return an empty dict so downstream code can
        # cheaply skip merging. ``content_type`` alone is not informative
        # enough to be worth recording when nothing else is known.
        return {}

    metadata: Dict[str, Any] = {}

    # ---- Core post/page fields ------------------------------------------------
    raw_date = item.get("date") or item.get("date_gmt") or item.get("modified")
    pub_date = _parse_iso_date(raw_date) if isinstance(raw_date, str) else None
    if pub_date is not None:
        metadata["date"] = pub_date.isoformat()
        metadata["year"] = pub_date.year
        metadata["month"] = pub_date.month

    post_id = item.get("id")
    if post_id is not None:
        try:
            metadata["post_id"] = str(int(post_id))
        except (TypeError, ValueError):
            metadata["post_id"] = str(post_id)

    # ``content_type`` reflects the endpoint we fetched from; ``item['type']``
    # is the actual WP post-type string ("post", "page", "tribe_events", …).
    if content_type:
        metadata["type"] = str(content_type)
    item_type = item.get("type")
    if item_type and item_type != content_type:
        metadata["wp_type"] = str(item_type)

    cat_ids = _stringify_id_list(item.get("categories"))
    if cat_ids:
        metadata["category_ids"] = cat_ids

    tag_ids = _stringify_id_list(item.get("tags"))
    if tag_ids:
        metadata["tag_ids"] = tag_ids

    slug = item.get("slug")
    if isinstance(slug, str) and slug.strip():
        metadata["slug"] = slug.strip()

    author_id = item.get("author")
    if author_id is not None:
        try:
            metadata["author_id"] = str(int(author_id))
        except (TypeError, ValueError):
            # Some installations expose author as a string slug or dict.
            if isinstance(author_id, str) and author_id.strip():
                metadata["author_id"] = author_id.strip()

    # ---- Event ACF fields -----------------------------------------------------
    acf = item.get("acf") if isinstance(item.get("acf"), dict) else {}

    if acf and _looks_like_event(item, acf):
        # Accept several common key names. ``event_start_date`` is canonical.
        start_raw = (
            acf.get("event_start_date")
            or acf.get("start_date")
            or acf.get("event_date")
        )
        end_raw = acf.get("event_end_date") or acf.get("end_date")

        start_d = _parse_event_date(start_raw)
        end_d = _parse_event_date(end_raw)

        if start_d is not None:
            metadata["event_start_date"] = start_d.isoformat()
            metadata["event_year"] = start_d.year
            metadata["event_month"] = start_d.month
        if end_d is not None:
            metadata["event_end_date"] = end_d.isoformat()

        location_raw = (
            acf.get("event_location")
            or acf.get("location")
            or acf.get("venue")
        )
        if location_raw:
            cleaned = _clean_inline(location_raw)
            if cleaned:
                metadata["event_location"] = cleaned

        # Mark the item as an event so retrieval can filter on it cheaply.
        # NOTE: deliberately NOT setting `is_upcoming` here — see module
        # docstring. Use ``compute_is_upcoming`` at query time instead.
        metadata["is_event"] = True

    return metadata


def compute_is_upcoming(
    metadata: Dict[str, Any],
    today: Optional[date] = None,
) -> bool:
    """Return ``True`` if the item's event_start_date is strictly after today.

    Evaluated at call time so the answer is always relative to "now". Pass
    ``today`` for deterministic tests.

    **Timezone Handling**: This function compares dates only (YYYY-MM-DD),
    ignoring time-of-day. WordPress event dates are assumed to be in the
    site's local timezone. Since we strip the time component, events are
    considered "upcoming" if their start date is after the current UTC date.
    For events near midnight in non-UTC timezones, this may introduce up to
    ±1 day classification error. This is acceptable for most use cases where
    "upcoming" is a broad filter rather than a precise timestamp comparison.
    """
    if not isinstance(metadata, dict):
        return False
    raw = metadata.get("event_start_date")
    if not raw:
        return False
    parsed = _parse_iso_date(raw) if isinstance(raw, str) else None
    if parsed is None:
        return False
    reference = today if today is not None else datetime.utcnow().date()
    return parsed > reference
