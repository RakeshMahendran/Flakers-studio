"""Integration test for re-ranking with factual overrides.

Demonstrates the full flow: retrieval → reranking → context assembly.
This test uses mocked dependencies to avoid requiring a live Qdrant instance.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.factual_overrides import FactualOverrideStore  # noqa: E402
from backend.retrieval.reranker import rerank  # noqa: E402


class RerankIntegrationTests(unittest.TestCase):
    """End-to-end tests showing reranking in a RAG pipeline context."""

    def test_factual_override_trumps_low_scoring_organic_hits(self):
        """When a factual override matches, it should trump low-scoring organic hits."""
        # Simulate an assistant with factual overrides configured
        assistant = MagicMock()
        assistant.factual_overrides = [
            {
                "trigger_keywords": ["ceo"],
                "canonical_answer": "The CEO of Acme Corp is Alice Johnson.",
                "source_url": "https://acme.com/about/leadership",
                "boost": 0.5,
                "confidence": 1.0,
                "source_title": "About → Leadership",
            }
        ]

        # Build the override store
        override_store = FactualOverrideStore.from_assistant(assistant)
        self.assertEqual(len(override_store), 1)

        # Simulate a query
        query = "Who is the CEO of Acme?"
        matched_override = override_store.find_match(query)
        self.assertIsNotNone(matched_override)

        # Simulate Qdrant returning some hits that don't directly answer the question
        organic_hits = [
            {
                "id": "hit1",
                "score": 0.72,
                "content": "Acme Corp is a leading tech company...",
                "source_url": "https://acme.com/about",
                "source_title": "About",
                "source_type": "page",
                "intent": "general",
                "confidence_score": 0.7,
                "requires_attribution": True,
                "is_policy_content": False,
                "is_sensitive": False,
                "metadata": {},
            },
            {
                "id": "hit2",
                "score": 0.68,
                "content": "Our leadership team is dedicated...",
                "source_url": "https://acme.com/blog/team",
                "source_title": "Team Blog",
                "source_type": "blog",
                "intent": "general",
                "confidence_score": 0.65,
                "requires_attribution": True,
                "is_policy_content": False,
                "is_sensitive": False,
                "metadata": {},
            },
        ]

        # Run reranking
        reranked_hits = rerank(organic_hits, query, matched_override)

        # The synthetic chunk should be prepended because no organic hit scored ≥ 0.9
        self.assertEqual(len(reranked_hits), 3)
        self.assertEqual(reranked_hits[0]["id"], "factual-override::https://acme.com/about/leadership")
        self.assertEqual(reranked_hits[0]["score"], 1.0)
        self.assertEqual(reranked_hits[0]["content"], "The CEO of Acme Corp is Alice Johnson.")
        self.assertTrue(reranked_hits[0]["requires_attribution"])
        self.assertEqual(reranked_hits[0]["source_url"], "https://acme.com/about/leadership")
        self.assertEqual(reranked_hits[0]["source_title"], "About → Leadership")

    def test_factual_override_boosts_canonical_source(self):
        """When Qdrant returns the canonical source, override boosts it to the top."""
        assistant = MagicMock()
        assistant.factual_overrides = [
            {
                "trigger_keywords": ["ceo"],
                "canonical_answer": "The CEO is Alice.",
                "source_url": "https://acme.com/about/ceo",
                "boost": 0.5,
            }
        ]

        override_store = FactualOverrideStore.from_assistant(assistant)
        matched_override = override_store.find_match("Who is the CEO?")

        organic_hits = [
            {
                "id": "hit1",
                "score": 0.85,
                "content": "Unrelated blog post...",
                "source_url": "https://acme.com/blog/random",
                "source_type": "blog",
                "metadata": {},
            },
            {
                "id": "canonical",
                "score": 0.75,
                "content": "The CEO is Alice.",
                "source_url": "https://acme.com/about/ceo",
                "source_type": "page",
                "metadata": {},
            },
        ]

        # Rerank with override
        reranked_hits = rerank(organic_hits, "Who is the CEO?", matched_override)

        # The canonical source should now rank first due to override boost
        # 0.75 * 1.5 = 1.125 -> normalized to ~0.91
        self.assertEqual(reranked_hits[0]["id"], "canonical")
        # After normalization, score should be > 0.85 and <= 1.0
        self.assertGreater(reranked_hits[0]["score"], 0.85)
        self.assertLessEqual(reranked_hits[0]["score"], 1.0)

    def test_recency_boost_promotes_recent_press(self):
        """Recent press releases should rank higher than old ones with similar scores."""
        # No factual override, just recency boost
        organic_hits = [
            {
                "id": "old-press",
                "score": 0.78,
                "content": "Old press release from 2019...",
                "source_url": "https://acme.com/press/2019",
                "source_type": "press",
                "metadata": {"year": 2019},
            },
            {
                "id": "recent-press",
                "score": 0.75,
                "content": "Recent press release from 2025...",
                "source_url": "https://acme.com/press/2025",
                "source_type": "press",
                "metadata": {"year": 2025},
            },
        ]

        reranked_hits = rerank(organic_hits, "latest press release", override=None)

        # The recent press should rank first despite lower base score
        self.assertEqual(reranked_hits[0]["id"], "recent-press")
        self.assertGreater(reranked_hits[0]["score"], reranked_hits[1]["score"])

    def test_non_time_sensitive_content_unaffected(self):
        """Documentation should not receive recency boost — old docs are valid."""
        organic_hits = [
            {
                "id": "old-doc",
                "score": 0.82,
                "content": "API documentation from 2018...",
                "source_url": "https://acme.com/docs/api",
                "source_type": "docs",
                "metadata": {"year": 2018},
            },
            {
                "id": "recent-doc",
                "score": 0.75,
                "content": "Updated doc from 2025...",
                "source_url": "https://acme.com/docs/api-v2",
                "source_type": "docs",
                "metadata": {"year": 2025},
            },
        ]

        reranked_hits = rerank(organic_hits, "API documentation", override=None)

        # The old doc should still rank first because docs don't get recency boost
        self.assertEqual(reranked_hits[0]["id"], "old-doc")
        self.assertAlmostEqual(reranked_hits[0]["score"], 0.82, places=2)

    def test_combined_recency_and_override_boost(self):
        """Both recency and override boosts should stack multiplicatively."""
        assistant = MagicMock()
        assistant.factual_overrides = [
            {
                "trigger_keywords": ["event"],
                "canonical_answer": "The next event is on May 15, 2026.",
                "source_url": "https://acme.com/events/2026",
                "boost": 0.5,
            }
        ]

        override_store = FactualOverrideStore.from_assistant(assistant)
        matched_override = override_store.find_match("What is the next event?")

        organic_hits = [
            {
                "id": "canonical-event",
                "score": 0.70,
                "content": "The next event is on May 15, 2026.",
                "source_url": "https://acme.com/events/2026",
                "source_type": "events",
                "metadata": {"year": 2026},
            },
            {
                "id": "other-hit",
                "score": 0.85,
                "content": "Some other content...",
                "source_url": "https://acme.com/blog",
                "source_type": "blog",
                "metadata": {},
            },
        ]

        reranked_hits = rerank(organic_hits, "What is the next event?", matched_override)

        # The canonical event should rank first with stacked boosts:
        # base_score * recency_weight * override_multiplier
        # 0.70 * 1.2 (within 1 year) * 1.5 (override boost) = 1.26
        self.assertEqual(reranked_hits[0]["id"], "canonical-event")
        self.assertGreater(reranked_hits[0]["score"], 0.85)


if __name__ == "__main__":
    unittest.main()
