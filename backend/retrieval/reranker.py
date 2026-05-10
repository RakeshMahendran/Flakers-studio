"""
Post-Qdrant re-ranking for recency and factual overrides.

After the vector store returns top-k hits, this module applies:
  1. **Recency boost** — promote recent content for time-sensitive categories
     (press, events, blog, news) based on the ``year`` metadata field.
  2. **Override boost** — amplify hits whose source_url matches a factual
     override's canonical URL, giving human-curated answers priority.
  3. **Factual fast path** — when an override matches but no organic hit
     scores highly after the first two adjustments, prepend a synthetic
     chunk using the override's canonical answer (with score=1.0) so the
     LLM sees the curated text verbatim.

The reranked list flows into context assembly → governance → synthesis, so
all existing policy/attribution rules still apply — re-ranking only
changes the **order** and optionally injects a single synthetic chunk at
the head.

Design notes:
    * Recency boost is multiplicative: ``new_score = base_score * recency_weight``.
      Weights are chosen to be gentle (1.2 max) to avoid overwhelming semantic
      similarity, but strong enough to break ties between equally relevant
      chunks of different ages.
    * Override boost is additive but expressed as a multiplier:
      ``new_score *= (1 + override.boost)``. Default boost is 0.5 → +50%.
    * The synthetic chunk is only prepended when **no** organic hit (post-boost)
      already scores ≥ 0.9. This avoids redundant duplication when Qdrant
      already found the canonical source organically.
    * Recency boost fires ONLY for categories identified as time-sensitive.
      Do NOT apply to "docs" or "policy" content where older material is
      equally valid.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Time-sensitive content categories that get recency boosting. Deliberately
# excludes "docs", "policy", "product", "faq" where older content remains
# equally valid. Expand this set if new time-sensitive categories emerge.
_TIME_SENSITIVE_CATEGORIES = frozenset({"press", "events", "blog", "news"})

# Recency multipliers by age bracket. Applied only when the hit's metadata
# contains a ``year`` field AND the hit's category/type is in the
# time-sensitive set above. Ages are computed relative to the current year.
# ``1.0`` is neutral (no change). Values > 1.0 boost, < 1.0 demote.
_RECENCY_WEIGHTS = [
    (1, 1.2),  # within last 1 year → +20%
    (2, 1.0),  # 1-2 years → neutral
    (5, 0.85),  # 2-5 years → -15%
    (float("inf"), 0.7),  # older → -30%
]


def rerank(
    hits: List[Dict[str, Any]],
    query: str,
    override: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Re-rank the given Qdrant hits by recency and factual overrides.

    Args:
        hits: The raw list of hits from Qdrant, each a dict with keys:
              ``id``, ``score``, ``content``, ``source_url``, ``metadata``, …
        query: User's original query text (currently unused by the scoring
               logic but passed for future intent-aware tweaks).
        override: Optional :class:`FactualOverride` matched by the query.
                  When present, hits whose ``source_url`` matches
                  ``override.source_url`` receive an additional multiplicative
                  boost. If no hit scores ≥ 0.9 after all adjustments, a
                  synthetic chunk is prepended using
                  ``override.as_synthetic_chunk()``.

    Returns:
        A new list of hits sorted by descending adjusted score. May be one
        item longer than the input list when the factual fast path fires.
    """
    if not hits:
        # Empty input → no organic results. If an override matched, return
        # the synthetic chunk solo so the LLM still sees the canonical answer.
        if override is not None:
            return [override.as_synthetic_chunk()]
        return []

    current_year = datetime.utcnow().year
    boosted_hits: List[Dict[str, Any]] = []

    for hit in hits:
        base_score = float(hit.get("score", 0.0))

        # 1. Recency boost
        recency_weight = _compute_recency_weight(hit, current_year)

        # 2. Override boost
        override_multiplier = 1.0
        if override is not None:
            hit_url = str(hit.get("source_url", ""))
            override_url = str(override.source_url)
            if hit_url and override_url and hit_url == override_url:
                override_multiplier = 1.0 + float(override.boost)

        # Combine
        adjusted_score = base_score * recency_weight * override_multiplier

        # Normalize score to [0.0, 1.0] to maintain contract with downstream code.
        # We use a soft cap with tanh to preserve relative ordering while preventing
        # extreme outliers. Scores above 1.0 are mapped smoothly into (0.9, 1.0).
        if adjusted_score > 1.0:
            # tanh((x - 1) / 2) maps [1, inf) -> [0, 1), then scale to [0.9, 1.0)
            adjusted_score = 0.9 + 0.1 * (1 - 1 / (1 + (adjusted_score - 1.0)))
        adjusted_score = max(0.0, min(1.0, adjusted_score))

        # Clone the hit dict and update the score. We mutate a copy so the
        # original list remains unchanged (callers may log it for debugging).
        reranked_hit = dict(hit)
        reranked_hit["score"] = adjusted_score
        boosted_hits.append(reranked_hit)

    # Sort by descending adjusted score
    boosted_hits.sort(key=lambda h: h["score"], reverse=True)

    # 3. Factual fast path
    # If an override matched and no organic hit now scores ≥ 0.9, prepend
    # a synthetic chunk so the LLM sees the canonical answer verbatim.
    if override is not None:
        best_organic_score = max((h["score"] for h in boosted_hits), default=0.0)
        if best_organic_score < 0.9:
            synthetic = override.as_synthetic_chunk()
            boosted_hits.insert(0, synthetic)
            logger.info(
                "Factual override fast path triggered: best_organic=%.3f < 0.9; "
                "prepending synthetic chunk from %s",
                best_organic_score,
                override.source_url,
            )

    return boosted_hits


def _compute_recency_weight(hit: Dict[str, Any], current_year: int) -> float:
    """Return a multiplicative recency weight for the given hit.

    Returns 1.0 (neutral) when:
      - The hit lacks a ``year`` field in its metadata.
      - The hit's category/type is not in the time-sensitive set.
      - The year is unparseable.

    Otherwise, looks up the age bracket in ``_RECENCY_WEIGHTS`` and returns
    the corresponding multiplier.
    """
    metadata = hit.get("metadata", {})
    if not isinstance(metadata, dict):
        return 1.0

    # Check if this hit is from a time-sensitive category. We check multiple
    # possible keys because the ingestion pipeline may store category info as
    # ``type``, ``source_type``, or ``category_ids``. For simplicity, treat
    # any of them matching a time-sensitive slug as a signal to apply the
    # recency boost.
    is_time_sensitive = False

    # Check top-level ``source_type`` (e.g., "blog", "press")
    source_type = hit.get("source_type", "").lower()
    if source_type in _TIME_SENSITIVE_CATEGORIES:
        is_time_sensitive = True

    # Check metadata ``type`` or ``wp_type``
    if not is_time_sensitive:
        for key in ("type", "wp_type"):
            val = metadata.get(key, "").lower()
            if val in _TIME_SENSITIVE_CATEGORIES:
                is_time_sensitive = True
                break

    # Check if any category_id slug contains a time-sensitive keyword.
    # category_ids is a list[str] of WP category IDs. We don't have the
    # category slug here unless it was stored separately, so for now we
    # skip this. Future enhancement: store category slugs if needed.

    if not is_time_sensitive:
        return 1.0

    # Extract year from metadata. The metadata_extractor stores it as an int.
    year_raw = metadata.get("year")
    if year_raw is None:
        return 1.0
    try:
        year = int(year_raw)
    except (TypeError, ValueError):
        return 1.0

    age = current_year - year
    for max_age, weight in _RECENCY_WEIGHTS:
        if age <= max_age:
            return weight

    # Fallback (shouldn't reach here given the infinity bracket)
    return 1.0
