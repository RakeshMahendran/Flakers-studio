"""Unit tests for backend.retrieval.filter_extractor.

These tests stub Azure entirely. We never reach the network: a fake
``AzureAIService`` is injected into ``FilterExtractor`` and returns
canned JSON strings.
"""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval import filter_extractor as fe_module  # noqa: E402
from backend.retrieval.filter_extractor import (  # noqa: E402
    DEFAULT_METADATA_SCHEMA,
    FilterExtractor,
    FilterResult,
    _LRUCache,
    _cache_key,
    build_qdrant_filter,
    reset_cache_for_tests,
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


class _StubAzure:
    """Minimal stand-in for ``AzureAIService`` used by the extractor."""

    def __init__(self, content: str = "", error: Optional[Exception] = None) -> None:
        self._content = content
        self._error = error
        self.calls: list[Dict[str, Any]] = []

    async def extract_filters(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 300,
        temperature: float = 0.0,
        tenant_id: Optional[str] = None,
        assistant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.calls.append(
            {
                "system_prompt": system_prompt,
                "user_message": user_message,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "tenant_id": tenant_id,
                "assistant_id": assistant_id,
            }
        )
        if self._error is not None:
            raise self._error
        return {"content": self._content, "usage": {}}


class FilterExtractorParseTests(unittest.TestCase):
    """The model-output parsing path. No network involved."""

    def setUp(self) -> None:
        reset_cache_for_tests()

    def _extractor(self, content: str) -> tuple[FilterExtractor, _StubAzure]:
        cache = _LRUCache(max_size=8)
        stub = _StubAzure(content=content)
        return FilterExtractor(azure_service=stub, cache=cache), stub

    def test_year_filter(self):
        ext, stub = self._extractor(
            json.dumps(
                {
                    "intent": "blog",
                    "year": 2024,
                    "confidence": "high",
                    "needs_aggregation": False,
                }
            )
        )
        result = asyncio.run(ext.extract("blog posts from 2024"))
        self.assertEqual(result.filters.get("year"), 2024)
        self.assertEqual(result.intent, "blog")
        self.assertEqual(result.confidence, "high")
        self.assertFalse(result.needs_aggregation)
        self.assertEqual(len(stub.calls), 1)

    def test_event_year_filter(self):
        ext, _ = self._extractor(
            json.dumps(
                {
                    "intent": "events",
                    "is_event": True,
                    "event_year": 2024,
                    "confidence": "high",
                }
            )
        )
        result = asyncio.run(ext.extract("events from 2024"))
        self.assertTrue(result.filters.get("is_event"))
        self.assertEqual(result.filters.get("event_year"), 2024)
        self.assertEqual(result.intent, "events")

    def test_upcoming_translates_to_date_lower_bound(self):
        ext, _ = self._extractor(
            json.dumps(
                {
                    "intent": "events",
                    "is_event": True,
                    "is_upcoming": True,
                }
            )
        )
        result = asyncio.run(ext.extract("upcoming events"))
        self.assertTrue(result.filters.get("is_event"))
        gte = result.filters.get("event_start_date_gte")
        self.assertIsNotNone(gte)
        # Today (UTC) — accept either today or yesterday for clock skew.
        today = datetime.utcnow().date().isoformat()
        self.assertEqual(gte, today)
        # is_upcoming should NOT itself be a Qdrant filter (translated only).
        self.assertNotIn("is_upcoming", result.filters)

    def test_no_filter_for_general_query(self):
        ext, _ = self._extractor(
            json.dumps({"intent": "general", "confidence": "none"})
        )
        result = asyncio.run(ext.extract("who is the CEO"))
        self.assertEqual(result.filters, {})
        self.assertEqual(result.confidence, "none")
        self.assertTrue(result.is_empty)

    def test_strips_markdown_fences(self):
        fenced = "```json\n" + json.dumps({"year": 2023}) + "\n```"
        ext, _ = self._extractor(fenced)
        result = asyncio.run(ext.extract("posts from 2023"))
        self.assertEqual(result.filters.get("year"), 2023)

    def test_invalid_json_returns_empty_filters(self):
        ext, _ = self._extractor("not json at all")
        result = asyncio.run(ext.extract("anything"))
        self.assertEqual(result.filters, {})
        self.assertEqual(result.confidence, "none")

    def test_invalid_year_dropped(self):
        ext, _ = self._extractor(json.dumps({"year": 99}))
        result = asyncio.run(ext.extract("ancient stuff"))
        self.assertNotIn("year", result.filters)

    def test_unknown_keys_ignored(self):
        ext, _ = self._extractor(
            json.dumps({"made_up_field": "xyz", "year": 2024})
        )
        result = asyncio.run(ext.extract("queries 2024"))
        self.assertEqual(set(result.filters.keys()), {"year"})

    def test_category_ids_normalised(self):
        ext, _ = self._extractor(
            json.dumps({"category_ids": [12, "12", 14, None, ""]})
        )
        result = asyncio.run(ext.extract("things"))
        self.assertEqual(result.filters.get("category_ids"), ["12", "14"])

    def test_event_date_range(self):
        ext, _ = self._extractor(
            json.dumps(
                {
                    "is_event": True,
                    "event_start_date_gte": "2024-01-01",
                    "event_start_date_lte": "2024-12-31",
                }
            )
        )
        result = asyncio.run(ext.extract("2024 events please"))
        self.assertEqual(result.filters.get("event_start_date_gte"), "2024-01-01")
        self.assertEqual(result.filters.get("event_start_date_lte"), "2024-12-31")


class FilterExtractorBehaviourTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_cache_for_tests()

    def test_blank_query_skips_llm(self):
        stub = _StubAzure(content="never reached")
        ext = FilterExtractor(azure_service=stub, cache=_LRUCache(max_size=8))
        result = asyncio.run(ext.extract(""))
        self.assertTrue(result.is_empty)
        self.assertEqual(stub.calls, [])

    def test_off_switch_disables_extractor(self):
        with patch.object(fe_module.settings, "ENABLE_FILTER_EXTRACTION", False, create=True):
            stub = _StubAzure(content=json.dumps({"year": 2024}))
            ext = FilterExtractor(azure_service=stub, cache=_LRUCache(max_size=8))
            result = asyncio.run(ext.extract("anything"))
            self.assertTrue(result.is_empty)
            self.assertEqual(stub.calls, [])

    def test_lru_cache_avoids_second_llm_call(self):
        stub = _StubAzure(content=json.dumps({"year": 2024}))
        cache = _LRUCache(max_size=8)
        ext = FilterExtractor(azure_service=stub, cache=cache)

        first = asyncio.run(ext.extract("events from 2024"))
        second = asyncio.run(ext.extract("events from 2024"))

        self.assertEqual(first.filters, second.filters)
        self.assertEqual(len(stub.calls), 1, "Identical query should not re-hit LLM")

    def test_cache_key_normalises_case_and_whitespace(self):
        self.assertEqual(_cache_key("Events from 2024"), _cache_key("  events from 2024  "))

    def test_default_schema_includes_event_fields(self):
        # Defensive: rich-metadata extractor stores these top-level.
        for key in ("year", "event_year", "category_ids", "tag_ids", "is_event"):
            self.assertIn(key, DEFAULT_METADATA_SCHEMA)

    def test_user_message_lists_available_filters(self):
        stub = _StubAzure(content=json.dumps({"year": 2024}))
        ext = FilterExtractor(azure_service=stub, cache=_LRUCache(max_size=8))
        asyncio.run(ext.extract("anything 2024"))
        self.assertEqual(len(stub.calls), 1)
        user_msg = stub.calls[0]["user_message"]
        self.assertIn("Available filter fields", user_msg)
        self.assertIn("event_year", user_msg)


class BuildQdrantFilterTests(unittest.TestCase):
    """Smoke-test the Qdrant filter assembler. Imports qdrant_client.models."""

    def test_assistant_id_always_present(self):
        f, applied = build_qdrant_filter("aid-123", None)
        # The first (and only) must-clause should target assistant_id.
        self.assertEqual(applied, [])
        keys = [c.key for c in f.must]
        self.assertIn("assistant_id", keys)

    def test_year_added(self):
        f, applied = build_qdrant_filter("aid-123", {"year": 2024})
        self.assertIn("year", applied)
        keys = [c.key for c in f.must]
        self.assertIn("year", keys)

    def test_category_ids_uses_match_any(self):
        f, applied = build_qdrant_filter("aid-123", {"category_ids": ["12", "13"]})
        self.assertIn("category_ids", applied)
        cat_clause = next(c for c in f.must if c.key == "category_ids")
        # Range / MatchValue / MatchAny are mutually exclusive on FieldCondition.
        self.assertIsNotNone(getattr(cat_clause, "match", None))

    def test_event_date_range_added(self):
        f, applied = build_qdrant_filter(
            "aid-123",
            {"event_start_date_gte": "2024-01-01", "event_start_date_lte": "2024-12-31"},
        )
        self.assertIn("event_start_date_gte", applied)
        self.assertIn("event_start_date_lte", applied)
        date_clause = next(c for c in f.must if c.key == "event_start_date")
        self.assertIsNotNone(date_clause.range)


class LRUCacheTests(unittest.TestCase):
    def test_evicts_oldest_when_full(self):
        c = _LRUCache(max_size=2)
        c.set("a", FilterResult(filters={"year": 1}))
        c.set("b", FilterResult(filters={"year": 2}))
        c.set("c", FilterResult(filters={"year": 3}))  # evicts "a"
        self.assertIsNone(c.get("a"))
        self.assertIsNotNone(c.get("b"))
        self.assertIsNotNone(c.get("c"))

    def test_get_promotes_recency(self):
        c = _LRUCache(max_size=2)
        c.set("a", FilterResult(filters={"year": 1}))
        c.set("b", FilterResult(filters={"year": 2}))
        # Touch "a" so "b" becomes the LRU entry.
        _ = c.get("a")
        c.set("c", FilterResult(filters={"year": 3}))  # should evict "b"
        self.assertIsNotNone(c.get("a"))
        self.assertIsNone(c.get("b"))
        self.assertIsNotNone(c.get("c"))


if __name__ == "__main__":
    unittest.main()
