"""Unit tests for backend.retrieval.reranker.

Tests cover:
  1. Recency boost for time-sensitive categories (press, events, blog, news).
  2. Factual override boost for matching source URLs.
  3. Factual fast path — synthetic chunk prepended when no organic hit scores ≥ 0.9.
  4. Neutral scoring for non-time-sensitive categories (docs, policy).
  5. Graceful handling of missing metadata.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.reranker import rerank  # noqa: E402


def _make_hit(
    hit_id: str,
    score: float,
    source_url: str,
    source_type: str = "general",
    year: int | None = None,
) -> Dict[str, Any]:
    """Helper to build a minimal Qdrant-shaped hit for tests."""
    metadata: Dict[str, Any] = {}
    if year is not None:
        metadata["year"] = year
    return {
        "id": hit_id,
        "score": score,
        "content": f"Content for {hit_id}",
        "source_url": source_url,
        "source_title": source_url,
        "source_type": source_type,
        "intent": "general",
        "confidence_score": 0.8,
        "requires_attribution": True,
        "is_policy_content": False,
        "is_sensitive": False,
        "metadata": metadata,
    }


class RecencyBoostTests(unittest.TestCase):
    """Recency boost should promote recent content for time-sensitive categories."""

    def test_recent_press_boosted_over_old(self):
        """A 2024 press hit should outscore a 2020 press hit with the same base score."""
        hits = [
            _make_hit("old-press", 0.75, "https://example.com/press/2020", source_type="press", year=2020),
            _make_hit("new-press", 0.75, "https://example.com/press/2024", source_type="press", year=2024),
        ]
        result = rerank(hits, query="recent news", override=None)

        # The 2024 hit should rank higher due to recency boost
        self.assertEqual(result[0]["id"], "new-press")
        self.assertEqual(result[1]["id"], "old-press")
        # The new hit should have score boosted (2024 is 2 years old in 2026, so weight is 1.0)
        # Actually, let's just verify it's higher
        self.assertGreater(result[0]["score"], result[1]["score"])
        # The old hit should have score demoted (2020 is 6 years ago from 2026, so it falls into the oldest bracket)
        self.assertLess(result[1]["score"], 0.75)

    def test_events_get_recency_boost(self):
        """Events category should also receive recency boost."""
        hits = [
            _make_hit("event-old", 0.8, "https://example.com/events/old", source_type="events", year=2019),
            _make_hit("event-new", 0.8, "https://example.com/events/new", source_type="events", year=2025),
        ]
        result = rerank(hits, query="upcoming events", override=None)
        self.assertEqual(result[0]["id"], "event-new")

    def test_blog_and_news_get_recency_boost(self):
        """Blog and news categories should receive recency boost."""
        hits = [
            _make_hit("blog-old", 0.7, "https://example.com/blog/old", source_type="blog", year=2018),
            _make_hit("news-new", 0.7, "https://example.com/news/new", source_type="news", year=2025),
        ]
        result = rerank(hits, query="latest blog", override=None)
        # News new should rank first
        self.assertEqual(result[0]["id"], "news-new")

    def test_docs_no_recency_boost(self):
        """Documentation should NOT receive recency boost — old docs are equally valid."""
        hits = [
            _make_hit("doc-old", 0.8, "https://example.com/docs/old", source_type="docs", year=2015),
            _make_hit("doc-new", 0.75, "https://example.com/docs/new", source_type="docs", year=2025),
        ]
        result = rerank(hits, query="how to use API", override=None)
        # The old doc should still rank first because it has a higher base score
        # and docs don't get recency boost
        self.assertEqual(result[0]["id"], "doc-old")
        self.assertAlmostEqual(result[0]["score"], 0.8, places=2)
        self.assertAlmostEqual(result[1]["score"], 0.75, places=2)

    def test_missing_year_no_recency_boost(self):
        """Hits without a year field should not receive recency boost."""
        hits = [
            _make_hit("press-no-year", 0.7, "https://example.com/press/unknown", source_type="press", year=None),
            _make_hit("press-with-year", 0.65, "https://example.com/press/2024", source_type="press", year=2024),
        ]
        result = rerank(hits, query="press release", override=None)
        # The no-year hit should still rank first because its base score is higher
        # and it gets no penalty
        self.assertEqual(result[0]["id"], "press-no-year")
        self.assertAlmostEqual(result[0]["score"], 0.7, places=2)


class OverrideBoostTests(unittest.TestCase):
    """Override boost should amplify hits matching the factual override's source URL."""

    def test_override_boosts_matching_url(self):
        """A hit whose source_url matches the override should receive a boost."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 0.5
        override.as_synthetic_chunk.return_value = {
            "id": "synthetic",
            "score": 1.0,
            "content": "The CEO is Alice.",
            "source_url": "https://example.com/about/ceo",
        }

        hits = [
            _make_hit("unrelated", 0.85, "https://example.com/blog/random", source_type="blog"),
            _make_hit("canonical", 0.7, "https://example.com/about/ceo", source_type="general"),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        # The canonical hit should now rank first due to override boost
        # 0.7 * 1.5 = 1.05 -> normalized to ~0.95
        self.assertEqual(result[0]["id"], "canonical")
        # After normalization, score should be > 0.85 and <= 1.0
        self.assertGreater(result[0]["score"], 0.85)
        self.assertLessEqual(result[0]["score"], 1.0)

    def test_override_no_match_no_boost(self):
        """Hits that don't match the override source_url should not receive boost."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 0.5
        override.as_synthetic_chunk.return_value = {
            "id": "synthetic",
            "score": 1.0,
            "content": "The CEO is Alice.",
            "source_url": "https://example.com/about/ceo",
        }

        hits = [
            _make_hit("hit1", 0.8, "https://example.com/blog/post1", source_type="blog"),
            _make_hit("hit2", 0.75, "https://example.com/blog/post2", source_type="blog"),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        # No hits match, so a synthetic chunk should be prepended (factual fast path)
        # because best organic score < 0.9
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["id"], "synthetic")


class FactualFastPathTests(unittest.TestCase):
    """Factual fast path should prepend synthetic chunk when no organic hit scores ≥ 0.9."""

    def test_synthetic_chunk_prepended_when_low_scores(self):
        """When override matches and best organic score < 0.9, prepend synthetic chunk."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 0.5
        override.as_synthetic_chunk.return_value = {
            "id": "synthetic",
            "score": 1.0,
            "content": "The CEO is Alice.",
            "source_url": "https://example.com/about/ceo",
        }

        hits = [
            _make_hit("hit1", 0.75, "https://example.com/blog/post1", source_type="blog"),
            _make_hit("hit2", 0.65, "https://example.com/blog/post2", source_type="blog"),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        # Synthetic chunk should be first
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["id"], "synthetic")
        self.assertEqual(result[0]["score"], 1.0)

    def test_synthetic_chunk_not_prepended_when_high_score(self):
        """When best organic score ≥ 0.9, do NOT prepend synthetic chunk."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 0.5

        hits = [
            _make_hit("canonical", 0.88, "https://example.com/about/ceo", source_type="general"),
            _make_hit("hit2", 0.65, "https://example.com/blog/post2", source_type="blog"),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        # The canonical hit gets boosted: 0.88 * 1.5 = 1.32
        # Since 1.32 ≥ 0.9, no synthetic chunk is prepended
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["id"], "canonical")
        self.assertGreaterEqual(result[0]["score"], 0.9)

    def test_empty_hits_with_override_returns_synthetic(self):
        """When hits are empty but override matches, return synthetic chunk solo."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 0.5
        override.as_synthetic_chunk.return_value = {
            "id": "synthetic",
            "score": 1.0,
            "content": "The CEO is Alice.",
            "source_url": "https://example.com/about/ceo",
        }

        result = rerank([], query="who is the CEO", override=override)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], "synthetic")


class ScoreNormalizationTests(unittest.TestCase):
    """Test that scores are properly normalized to [0, 1] after boosting."""

    def test_high_boost_score_normalized(self):
        """When boosts push score above 1.0, it should be normalized."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 2.0  # 3x multiplier
        override.as_synthetic_chunk.return_value = {"id": "synthetic", "score": 1.0}

        hits = [
            _make_hit("canonical", 0.8, "https://example.com/about/ceo", source_type="press", year=2025),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        # 0.8 * 1.2 (recency) * 3.0 (override) = 2.88, should be normalized to < 1.0
        self.assertLessEqual(result[0]["score"], 1.0)
        self.assertGreater(result[0]["score"], 0.9)  # Should be close to 1.0

    def test_all_scores_in_valid_range(self):
        """All reranked scores should be in [0, 1]."""
        override = MagicMock()
        override.source_url = "https://example.com/about/ceo"
        override.boost = 5.0  # Very high boost
        override.as_synthetic_chunk.return_value = {"id": "synthetic", "score": 1.0}

        hits = [
            _make_hit("hit1", 0.95, "https://example.com/about/ceo", source_type="press", year=2025),
            _make_hit("hit2", 0.7, "https://example.com/blog", source_type="blog", year=2020),
            _make_hit("hit3", 0.5, "https://example.com/docs", source_type="docs", year=2015),
        ]
        result = rerank(hits, query="who is the CEO", override=override)

        for hit in result:
            with self.subTest(hit_id=hit["id"]):
                self.assertGreaterEqual(hit["score"], 0.0)
                self.assertLessEqual(hit["score"], 1.0)


class EdgeCaseTests(unittest.TestCase):
    """Edge cases and error handling."""

    def test_empty_hits_no_override_returns_empty(self):
        """When hits are empty and no override, return empty list."""
        result = rerank([], query="test query", override=None)
        self.assertEqual(result, [])

    def test_missing_metadata_graceful(self):
        """Hits with missing or malformed metadata should not crash."""
        hits = [
            {"id": "hit1", "score": 0.8, "source_url": "url1"},  # No metadata key
            {"id": "hit2", "score": 0.7, "source_url": "url2", "metadata": None},  # None metadata
            {"id": "hit3", "score": 0.6, "source_url": "url3", "metadata": "not a dict"},  # Invalid metadata
        ]
        result = rerank(hits, query="test", override=None)
        # Should return all hits, sorted by score
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["id"], "hit1")


if __name__ == "__main__":
    unittest.main()
