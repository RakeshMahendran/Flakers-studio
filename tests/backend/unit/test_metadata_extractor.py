"""Unit tests for backend.ingestion.metadata_extractor."""
from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.ingestion.metadata_extractor import (
    compute_is_upcoming,
    extract_metadata,
)


class ExtractMetadataPostTests(unittest.TestCase):
    """Standard WP post / page items."""

    def test_post_with_date_categories_and_tags(self):
        item = {
            "id": 4321,
            "date": "2024-03-15T10:30:00",
            "type": "post",
            "slug": "hello-world",
            "author": 7,
            "categories": [12, 34],
            "tags": [5, 6, 7],
        }

        meta = extract_metadata(item, content_type="post", source_url="https://example.com/hello")

        self.assertEqual(meta["date"], "2024-03-15")
        self.assertEqual(meta["year"], 2024)
        self.assertEqual(meta["month"], 3)
        self.assertEqual(meta["post_id"], "4321")
        self.assertEqual(meta["type"], "post")
        # All ID lists are stringified.
        self.assertEqual(meta["category_ids"], ["12", "34"])
        self.assertEqual(meta["tag_ids"], ["5", "6", "7"])
        self.assertEqual(meta["slug"], "hello-world")
        self.assertEqual(meta["author_id"], "7")
        self.assertNotIn("is_event", meta)
        # No nested dicts — everything flat.
        for value in meta.values():
            self.assertNotIsInstance(value, dict)

    def test_page_uses_iso_date_only_no_time(self):
        item = {"id": 99, "date": "2023-11-02", "categories": []}
        meta = extract_metadata(item, "page", "https://example.com/about")

        self.assertEqual(meta["date"], "2023-11-02")
        self.assertEqual(meta["year"], 2023)
        self.assertEqual(meta["month"], 11)
        # Empty WP arrays must not pollute the dict with empty lists.
        self.assertNotIn("category_ids", meta)
        self.assertNotIn("tag_ids", meta)

    def test_wp_type_stored_when_different_from_endpoint(self):
        item = {"id": 1, "type": "tribe_events", "date": "2024-01-01"}
        meta = extract_metadata(item, content_type="post", source_url="https://x")
        self.assertEqual(meta["type"], "post")
        self.assertEqual(meta["wp_type"], "tribe_events")

    def test_invalid_date_string_is_dropped(self):
        item = {"id": 1, "date": "not-a-date"}
        meta = extract_metadata(item, "post", "https://x")
        self.assertNotIn("date", meta)
        self.assertNotIn("year", meta)


class ExtractMetadataEventTests(unittest.TestCase):
    """ACF event extraction (YYYYMMDD start_date)."""

    def test_event_with_yyyymmdd_acf_dates(self):
        item = {
            "id": 100,
            "date": "2024-02-01T09:00:00",
            "type": "post",
            "categories": [99],
            "acf": {
                "event_start_date": "20240615",
                "event_end_date": "20240617",
                "event_location": "Hyde Park <br/> London",
            },
        }
        meta = extract_metadata(item, "post", "https://example.com/event")

        self.assertEqual(meta["event_start_date"], "2024-06-15")
        self.assertEqual(meta["event_end_date"], "2024-06-17")
        self.assertEqual(meta["event_year"], 2024)
        self.assertEqual(meta["event_month"], 6)
        # <br> stripped from location.
        self.assertEqual(meta["event_location"], "Hyde Park London")
        self.assertTrue(meta["is_event"])
        # Spec rule: do NOT bake is_upcoming into the index.
        self.assertNotIn("is_upcoming", meta)

    def test_event_recognized_by_category_slug_when_no_acf_dates(self):
        item = {
            "id": 200,
            "date": "2024-01-10",
            "event_categories": [{"slug": "annual-event"}],
            "acf": {"event_location": "Online"},
        }
        meta = extract_metadata(item, "post", "https://x")
        self.assertTrue(meta.get("is_event", False))
        self.assertEqual(meta["event_location"], "Online")
        # No usable date in ACF — start fields absent, not invented.
        self.assertNotIn("event_start_date", meta)

    def test_event_with_iso_acf_dates(self):
        item = {
            "id": 300,
            "acf": {"event_start_date": "2025-09-01", "event_end_date": "2025-09-03"},
        }
        meta = extract_metadata(item, "post", "https://x")
        self.assertEqual(meta["event_start_date"], "2025-09-01")
        self.assertEqual(meta["event_end_date"], "2025-09-03")

    def test_event_location_strips_html_entities(self):
        item = {
            "id": 1,
            "acf": {
                "event_start_date": "20240101",
                "event_location": "<strong>HQ</strong><br>Floor 3",
            },
        }
        meta = extract_metadata(item, "post", "https://x")
        self.assertEqual(meta["event_location"], "HQ Floor 3")


class ExtractMetadataEdgeCaseTests(unittest.TestCase):
    def test_empty_item_returns_empty_dict(self):
        self.assertEqual(extract_metadata({}, "post", "https://x"), {})

    def test_non_dict_input_returns_empty(self):
        # Defensive: extractor must never raise.
        self.assertEqual(extract_metadata(None, "post", "https://x"), {})  # type: ignore[arg-type]
        self.assertEqual(extract_metadata("garbage", "post", "https://x"), {})  # type: ignore[arg-type]

    def test_only_id_present_yields_minimal_metadata(self):
        meta = extract_metadata({"id": 42}, "page", "https://x")
        self.assertEqual(meta, {"post_id": "42", "type": "page"})

    def test_metadata_values_are_flat(self):
        item = {
            "id": 1,
            "date": "2024-01-01",
            "categories": [10, 20],
            "tags": [30],
            "acf": {
                "event_start_date": "20240601",
                "event_location": "Venue",
            },
        }
        meta = extract_metadata(item, "post", "https://x")
        for key, value in meta.items():
            with self.subTest(key=key):
                if isinstance(value, list):
                    for v in value:
                        self.assertIsInstance(v, str)
                else:
                    self.assertIsInstance(value, (str, int, bool))


class IsUpcomingTests(unittest.TestCase):
    """``is_upcoming`` is evaluated lazily at query time."""

    def test_future_event_is_upcoming(self):
        today = date(2024, 6, 1)
        meta = {"event_start_date": "2024-12-25"}
        self.assertTrue(compute_is_upcoming(meta, today=today))

    def test_past_event_is_not_upcoming(self):
        today = date(2024, 6, 1)
        meta = {"event_start_date": "2024-01-01"}
        self.assertFalse(compute_is_upcoming(meta, today=today))

    def test_today_is_not_upcoming_strictly_in_future(self):
        today = date(2024, 6, 1)
        meta = {"event_start_date": "2024-06-01"}
        self.assertFalse(compute_is_upcoming(meta, today=today))

    def test_missing_event_date_returns_false(self):
        self.assertFalse(compute_is_upcoming({}))
        self.assertFalse(compute_is_upcoming({"year": 2024}))

    def test_invalid_event_date_returns_false(self):
        self.assertFalse(compute_is_upcoming({"event_start_date": "not-a-date"}))

    def test_default_uses_today(self):
        # Sanity: with no explicit ``today``, future date is upcoming.
        future = (date.today() + timedelta(days=30)).isoformat()
        self.assertTrue(compute_is_upcoming({"event_start_date": future}))


if __name__ == "__main__":
    unittest.main()
