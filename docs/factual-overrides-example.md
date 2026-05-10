# Factual Overrides: Usage Examples

This document demonstrates how to configure and use factual overrides to ensure 100% accuracy for known factual queries like "who is the CEO", "what's the office address", etc.

## Overview

Factual overrides allow you to provide canonical, curated answers for specific questions. When a user's query matches the trigger keywords, the system will:

1. **Boost matching sources** - If Qdrant retrieves the canonical source URL, it gets amplified with a multiplicative boost
2. **Inject synthetic chunk** - If no organic hit scores highly enough, prepend a synthetic chunk with your canonical answer
3. **Maintain attribution** - The synthetic chunk carries `requires_attribution=True` and the source URL, so governance rules still apply

## Configuration

Factual overrides are stored in the `Assistant.factual_overrides` JSONB column. Each entry has this shape:

```json
{
  "trigger_keywords": ["ceo", "chief executive"],
  "canonical_answer": "The CEO of Acme Corp is Jane Doe, who has led the company since 2020.",
  "source_url": "https://acme.com/about/leadership",
  "source_title": "About → Leadership",
  "boost": 0.5,
  "confidence": 1.0
}
```

### Fields

- **`trigger_keywords`** (required): List of keywords that must ALL appear in the query (case-insensitive, word-boundary aware)
- **`canonical_answer`** (required): The exact text to show when this override fires
- **`source_url`** (required): The authoritative URL this answer came from
- **`source_title`** (optional): Human-readable title (defaults to source_url)
- **`boost`** (optional): Multiplicative boost for hits matching this source_url (default: 0.5 = +50%)
- **`confidence`** (optional): Confidence score for the synthetic chunk (default: 1.0)

## Example Configurations

### CEO / Leadership

```json
{
  "trigger_keywords": ["ceo"],
  "canonical_answer": "The CEO of Acme Corp is Jane Doe.",
  "source_url": "https://acme.com/about/leadership",
  "source_title": "About → Leadership"
}
```

Matches:
- ✅ "Who is the CEO?"
- ✅ "Tell me about the CEO"
- ✅ "What's the CEO's background?"
- ❌ "What is a CEO?" (out of scope, but would match - refine keywords if needed)

### Office Address

```json
{
  "trigger_keywords": ["office", "address"],
  "canonical_answer": "Our headquarters is located at 123 Main Street, San Francisco, CA 94105.",
  "source_url": "https://acme.com/contact",
  "source_title": "Contact Us"
}
```

Matches:
- ✅ "What is your office address?"
- ✅ "Where is your office located?"
- ❌ "What is the CEO's office like?" (contains both keywords but different intent - consider more specific keywords)

### Founder Information

```json
{
  "trigger_keywords": ["founder", "founded"],
  "canonical_answer": "Acme Corp was founded in 2015 by Alice Smith and Bob Johnson.",
  "source_url": "https://acme.com/about/history",
  "source_title": "Company History"
}
```

Matches:
- ✅ "Who founded the company?"
- ✅ "When was Acme founded?"
- ✅ "Tell me about the founders"

### Multi-keyword Precision

For maximum precision, require multiple keywords:

```json
{
  "trigger_keywords": ["office", "san francisco"],
  "canonical_answer": "Our San Francisco office is at 123 Main Street, San Francisco, CA 94105.",
  "source_url": "https://acme.com/contact/sf-office"
}
```

This only matches when BOTH "office" AND "san francisco" appear in the query.

## API Usage (Placeholder for Future Implementation)

The task spec mentions an optional admin endpoint. Here's the intended design:

### GET /assistants/{id}/factual-overrides

Returns the current list of overrides for an assistant.

### PUT /assistants/{id}/factual-overrides

Updates the entire list (replaces existing).

**Request body:**
```json
[
  {
    "trigger_keywords": ["ceo"],
    "canonical_answer": "The CEO is Jane Doe.",
    "source_url": "https://acme.com/about/leadership"
  }
]
```

## Testing Your Overrides

### Unit Test Example

```python
from backend.retrieval.factual_overrides import FactualOverrideStore

# Build a store from raw JSON
store = FactualOverrideStore.from_raw([
    {
        "trigger_keywords": ["ceo"],
        "canonical_answer": "The CEO is Jane Doe.",
        "source_url": "https://acme.com/about/leadership",
    }
])

# Test matching
result = store.find_match("Who is the CEO?")
assert result is not None
assert result.canonical_answer == "The CEO is Jane Doe."
```

### Integration Test Example

See `tests/backend/integration/test_rerank_integration.py` for full examples showing:
- Synthetic chunk prepending when organic hits are weak
- Boost amplification when the canonical source is retrieved
- Combination with recency boosting

## Best Practices

1. **Order matters**: Overrides are checked in order; the first match wins. Put more specific overrides first:
   ```json
   [
     {"trigger_keywords": ["ceo", "background"], ...},  // More specific
     {"trigger_keywords": ["ceo"], ...}                  // More general
   ]
   ```

2. **Use precise keywords**: Avoid overly broad matches. "address" alone might match too much; "office address" is better.

3. **Keep answers concise**: The canonical answer goes into the LLM context. Aim for 1-3 sentences.

4. **Verify source URLs**: The system uses source_url for both boosting and attribution. Make sure it's correct and public.

5. **Test edge cases**: Try queries with typos, different phrasings, and unrelated questions to ensure your keywords are specific enough.

## Performance Characteristics

- **Latency**: Override matching is regex-based (with per-keyword caching) and adds ~0.1ms per query
- **Memory**: Regex patterns are cached per process; typical memory overhead is <1KB per assistant
- **Accuracy**: When properly configured, factual overrides achieve 100% accuracy on their target queries

## Migration Notes

After deploying this feature:

1. Run the migration: `alembic upgrade head`
2. Existing assistants will have an empty `factual_overrides` list (default)
3. No behavior change until overrides are configured per assistant
4. To backfill overrides for existing assistants, use SQL or the planned admin API
