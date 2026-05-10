"""
Demonstration of re-ranking and factual overrides.

This script shows how the reranker works with example data. It can be run
standalone without requiring a live Qdrant or database connection.
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.retrieval.factual_overrides import FactualOverride, FactualOverrideStore
from backend.retrieval.reranker import rerank


def demo_recency_boost():
    """Demonstrate recency boosting for time-sensitive content."""
    print("\n" + "=" * 70)
    print("DEMO 1: Recency Boost for Time-Sensitive Content")
    print("=" * 70)

    # Simulate Qdrant results for a query: "latest press releases"
    hits = [
        {
            "id": "old-press",
            "score": 0.80,
            "content": "Company announces Q1 2019 earnings...",
            "source_url": "https://acme.com/press/2019-q1-earnings",
            "source_type": "press",
            "metadata": {"year": 2019},
        },
        {
            "id": "recent-press",
            "score": 0.75,
            "content": "Company launches new AI platform in 2025...",
            "source_url": "https://acme.com/press/2025-ai-launch",
            "source_type": "press",
            "metadata": {"year": 2025},
        },
        {
            "id": "doc",
            "score": 0.78,
            "content": "Product documentation from 2018...",
            "source_url": "https://acme.com/docs/api",
            "source_type": "docs",
            "metadata": {"year": 2018},
        },
    ]

    print("\nBEFORE re-ranking (sorted by Qdrant score):")
    for i, hit in enumerate(sorted(hits, key=lambda h: h["score"], reverse=True), 1):
        print(f"  {i}. {hit['id']:<15} score={hit['score']:.2f}  year={hit['metadata'].get('year', 'N/A')}")

    # Apply reranking (no override, just recency boost)
    reranked = rerank(hits, query="latest press releases", override=None)

    print("\nAFTER re-ranking (with recency boost):")
    for i, hit in enumerate(reranked, 1):
        year = hit['metadata'].get('year', 'N/A')
        print(f"  {i}. {hit['id']:<15} score={hit['score']:.2f}  year={year}")

    print("\nExplanation:")
    print("  - 'recent-press' (2025) gets boosted: 0.75 x 1.2 = 0.90")
    print("  - 'old-press' (2019) gets demoted: 0.80 x 0.7 = 0.56")
    print("  - 'doc' (2018) stays neutral: 0.78 x 1.0 = 0.78 (docs don't get recency boost)")
    print("  -> Recent press now ranks first despite lower base score!")


def demo_factual_override():
    """Demonstrate factual override with synthetic chunk injection."""
    print("\n" + "=" * 70)
    print("DEMO 2: Factual Override with Synthetic Chunk")
    print("=" * 70)

    # Configure a factual override
    override = FactualOverride(
        trigger_keywords=["ceo"],
        canonical_answer="The CEO of Acme Corp is Jane Doe, appointed in 2020.",
        source_url="https://acme.com/about/leadership",
        source_title="About -> Leadership",
        boost=0.5,
    )

    print(f"\nConfigured override: trigger={override.trigger_keywords}")
    print(f"  Canonical answer: {override.canonical_answer}")

    # Simulate Qdrant results for query: "Who is the CEO?"
    hits = [
        {
            "id": "about-page",
            "score": 0.72,
            "content": "Acme Corp is a leading technology company...",
            "source_url": "https://acme.com/about",
            "source_type": "page",
            "metadata": {},
        },
        {
            "id": "team-blog",
            "score": 0.68,
            "content": "Our team is dedicated to innovation...",
            "source_url": "https://acme.com/blog/team",
            "source_type": "blog",
            "metadata": {},
        },
    ]

    print("\nBEFORE re-ranking:")
    for i, hit in enumerate(hits, 1):
        print(f"  {i}. {hit['id']:<15} score={hit['score']:.2f}")

    # Apply reranking with override
    reranked = rerank(hits, query="Who is the CEO?", override=override)

    print("\nAFTER re-ranking (with factual override):")
    for i, hit in enumerate(reranked, 1):
        print(f"  {i}. {hit['id']:<30} score={hit['score']:.2f}")
        if hit.get('metadata', {}).get('factual_override'):
            print(f"      -> SYNTHETIC CHUNK: {hit['content']}")

    print("\nExplanation:")
    print("  - No organic hit scored >= 0.9")
    print("  - Synthetic chunk prepended with score=1.0")
    print("  - LLM will see the canonical answer verbatim")
    print("  - Governance still applies (carries source_url and requires_attribution)")


def demo_override_boost():
    """Demonstrate override boosting when the canonical source is retrieved."""
    print("\n" + "=" * 70)
    print("DEMO 3: Override Boost for Canonical Source")
    print("=" * 70)

    override = FactualOverride(
        trigger_keywords=["ceo"],
        canonical_answer="The CEO is Jane Doe.",
        source_url="https://acme.com/about/leadership",
        boost=0.5,
    )

    # Simulate Qdrant retrieving the canonical source, but with lower score
    hits = [
        {
            "id": "blog-post",
            "score": 0.82,
            "content": "Random blog post about technology...",
            "source_url": "https://acme.com/blog/tech-trends",
            "source_type": "blog",
            "metadata": {},
        },
        {
            "id": "canonical",
            "score": 0.75,
            "content": "The CEO is Jane Doe, appointed in 2020.",
            "source_url": "https://acme.com/about/leadership",
            "source_type": "page",
            "metadata": {},
        },
    ]

    print("\nBEFORE re-ranking:")
    for i, hit in enumerate(sorted(hits, key=lambda h: h["score"], reverse=True), 1):
        print(f"  {i}. {hit['id']:<15} score={hit['score']:.2f}")

    reranked = rerank(hits, query="Who is the CEO?", override=override)

    print("\nAFTER re-ranking (with override boost):")
    for i, hit in enumerate(reranked, 1):
        print(f"  {i}. {hit['id']:<15} score={hit['score']:.2f}")

    print("\nExplanation:")
    print("  - 'canonical' matches override source_url")
    print("  - Gets boosted: 0.75 x (1 + 0.5) = 0.75 x 1.5 = 1.125")
    print("  - Now ranks first, beating the blog post")
    print("  - Since canonical scored >= 0.9, no synthetic chunk needed")


def demo_combined():
    """Demonstrate combined recency + override boost."""
    print("\n" + "=" * 70)
    print("DEMO 4: Combined Recency and Override Boost")
    print("=" * 70)

    override = FactualOverride(
        trigger_keywords=["event"],
        canonical_answer="The next event is TechConf 2026 on May 15.",
        source_url="https://acme.com/events/2026-techconf",
        boost=0.5,
    )

    hits = [
        {
            "id": "other-hit",
            "score": 0.88,
            "content": "General information about events...",
            "source_url": "https://acme.com/events",
            "source_type": "page",
            "metadata": {},
        },
        {
            "id": "canonical-event",
            "score": 0.70,
            "content": "TechConf 2026 will be on May 15...",
            "source_url": "https://acme.com/events/2026-techconf",
            "source_type": "events",
            "metadata": {"year": 2026},
        },
    ]

    print("\nBEFORE re-ranking:")
    for i, hit in enumerate(sorted(hits, key=lambda h: h["score"], reverse=True), 1):
        print(f"  {i}. {hit['id']:<20} score={hit['score']:.2f}")

    reranked = rerank(hits, query="What is the next event?", override=override)

    print("\nAFTER re-ranking (combined boosts):")
    for i, hit in enumerate(reranked, 1):
        print(f"  {i}. {hit['id']:<20} score={hit['score']:.2f}")

    print("\nExplanation:")
    print("  - 'canonical-event' gets BOTH boosts:")
    print("    -> Recency: 2026 is within 1 year = 1.2x")
    print("    -> Override: matches source_url = 1.5x")
    print("    -> Combined: 0.70 x 1.2 x 1.5 = 1.26")
    print("  - Now easily beats the 0.88 general page")


if __name__ == "__main__":
    print("\n")
    print("=" * 70)
    print(" " * 15 + "Re-ranking & Factual Overrides Demo")
    print("=" * 70)

    demo_recency_boost()
    demo_factual_override()
    demo_override_boost()
    demo_combined()

    print("\n" + "=" * 70)
    print("Demo complete! See docs/factual-overrides-example.md for more info.")
    print("=" * 70 + "\n")
