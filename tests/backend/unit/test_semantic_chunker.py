"""Unit tests for backend.ingestion.semantic_chunker."""
from __future__ import annotations

import asyncio
import math
import sys
import unittest
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import tiktoken

from backend.ingestion.semantic_chunker import (
    SemanticChunker,
    is_corrupted_chunk,
    split_sentences,
)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _run(coro):
    """Sync wrapper for awaiting a coroutine in a unittest method."""
    return asyncio.run(coro)


def _bag_of_chars_embed(texts: List[str]) -> List[List[float]]:
    """Deterministic stand-in for a real embedding model.

    Maps each sentence to a 27-dim vector counting [a-z] frequencies +
    one bucket for everything else. Sentences that share vocabulary
    therefore have high cosine similarity; sentences from distinct
    vocabularies have low similarity. This is enough to exercise the
    boundary-detection logic without calling Azure.
    """
    out: List[List[float]] = []
    for t in texts:
        vec = [0.0] * 27
        for ch in t.lower():
            if "a" <= ch <= "z":
                vec[ord(ch) - ord("a")] += 1.0
            else:
                vec[26] += 1.0
        out.append(vec)
    return out


async def _async_bag_of_chars(texts: List[str]) -> List[List[float]]:
    return _bag_of_chars_embed(texts)


class _TopicEmbedder:
    """Deterministic embedder that assigns each sentence to a "topic".

    A sentence's vector is one-hot on its topic id. Sentences in the
    same topic have cosine 1.0; across topics, 0.0. The mapping is by
    keyword presence so tests can author multi-topic prose freely.
    """

    def __init__(self, topic_keywords):
        # topic_keywords: list of (topic_id, [keyword, ...])
        self.topic_keywords = topic_keywords
        self.dim = max(t for t, _ in topic_keywords) + 2  # +1 for "other"

    def __call__(self, texts: List[str]) -> List[List[float]]:
        # Sync interface; the chunker accepts an async fn so we wrap.
        out = []
        for t in texts:
            vec = [0.0] * self.dim
            assigned = False
            tl = t.lower()
            for topic_id, keywords in self.topic_keywords:
                if any(k in tl for k in keywords):
                    vec[topic_id] = 1.0
                    assigned = True
                    break
            if not assigned:
                vec[-1] = 1.0
            out.append(vec)
        return out

    async def aembed(self, texts: List[str]) -> List[List[float]]:
        return self(texts)


# ---------------------------------------------------------------------------
# Corruption detector
# ---------------------------------------------------------------------------


class IsCorruptedChunkTests(unittest.TestCase):
    def test_clean_text_is_not_corrupted(self):
        self.assertFalse(
            is_corrupted_chunk(
                "This is a perfectly ordinary sentence used in the unit tests."
            )
        )

    def test_uni_glyph_stream_is_corrupted(self):
        garbage = "/uni0BAE /uni0BB0 /uni0BBE /uni0BBF /uni0BC8 /uni0BBE word"
        self.assertTrue(is_corrupted_chunk(garbage))

    def test_notdef_stream_is_corrupted(self):
        garbage = ".notdef .notdef .notdef text"
        self.assertTrue(is_corrupted_chunk(garbage))

    def test_null_byte_is_corrupted(self):
        self.assertTrue(is_corrupted_chunk("Hello\x00 world"))

    def test_too_short_is_corrupted(self):
        self.assertTrue(is_corrupted_chunk("short"))
        self.assertTrue(is_corrupted_chunk("   "))
        self.assertTrue(is_corrupted_chunk(""))

    def test_non_string_is_corrupted(self):
        self.assertTrue(is_corrupted_chunk(None))  # type: ignore[arg-type]
        self.assertTrue(is_corrupted_chunk(123))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Sentence splitter
# ---------------------------------------------------------------------------


class SplitSentencesTests(unittest.TestCase):
    def test_basic_split(self):
        text = "First sentence. Second sentence! Third one? Final."
        out = split_sentences(text)
        self.assertEqual(len(out), 4)
        self.assertEqual(out[0], "First sentence.")
        self.assertEqual(out[3], "Final.")

    def test_empty_input(self):
        self.assertEqual(split_sentences(""), [])
        self.assertEqual(split_sentences("   "), [])

    def test_single_sentence_no_terminal_punct(self):
        out = split_sentences("Just one sentence here")
        self.assertEqual(out, ["Just one sentence here"])

    def test_does_not_split_inside_quoted_speech(self):
        # The naive splitter only fires on punctuation followed by
        # whitespace + capital. "Mr." inside a name should stay attached
        # because what follows is a lowercase letter (the surname).
        out = split_sentences("Mr. smith arrived. Then he left.")
        self.assertEqual(len(out), 2)


# ---------------------------------------------------------------------------
# Chunker behaviour
# ---------------------------------------------------------------------------


class SemanticChunkerCoreTests(unittest.TestCase):
    def setUp(self):
        self.tokenizer = tiktoken.get_encoding("cl100k_base")

    def _new_chunker(
        self,
        embed_fn=_async_bag_of_chars,
        target_min=300,
        target_max=600,
        overlap=100,
        threshold=0.5,
        max_sentences=200,
    ) -> SemanticChunker:
        return SemanticChunker(
            target_min=target_min,
            target_max=target_max,
            overlap_tokens=overlap,
            similarity_threshold=threshold,
            max_sentences_per_page=max_sentences,
            embedding_fn=embed_fn,
            tokenizer=self.tokenizer,
        )

    # ---------- algorithmic correctness ----------

    def test_short_single_paragraph_returns_one_chunk(self):
        text = (
            "This is a short paragraph about onboarding. "
            "It only has a couple of sentences. "
            "It should remain a single chunk."
        )
        chunker = self._new_chunker()
        chunks = _run(chunker.chunk(text))
        self.assertEqual(len(chunks), 1)

    def test_two_topic_article_yields_at_least_two_chunks(self):
        # Two topics with disjoint vocabulary -> low cosine across the
        # boundary, high cosine within. We pad each topic so the
        # individual chunks are above the 300-token floor.
        topic_a = (
            "Pizza dough is made from flour, water, salt, and yeast. "
            "Pizza ovens are heated to very high temperatures. "
            "Pizza toppings vary by region and tradition. "
        ) * 8
        topic_b = (
            "Quantum entanglement involves correlated particles. "
            "Quantum computers exploit superposition for speedup. "
            "Quantum decoherence destroys fragile quantum states. "
        ) * 8
        text = topic_a + topic_b

        embedder = _TopicEmbedder(
            [
                (0, ["pizza", "dough", "oven", "topping"]),
                (1, ["quantum", "entangle", "superposition", "decoherence"]),
            ]
        )
        chunker = self._new_chunker(
            embed_fn=embedder.aembed,
            target_min=80,
            target_max=400,
            overlap=20,
        )
        chunks = _run(chunker.chunk(text))
        self.assertGreaterEqual(len(chunks), 2)
        # First chunk (sans overlap prefix) should be pizza-dominated;
        # second chunk's tail should contain quantum vocabulary.
        self.assertIn("pizza", chunks[0].lower())
        self.assertIn("quantum", chunks[-1].lower())

    def test_long_monolithic_paragraph_split_at_token_cap(self):
        # 60 nearly-identical sentences => no semantic boundaries, but
        # the assembled group exceeds target_max and must be cut.
        sentence = (
            "The committee approved the proposal after reviewing the "
            "budget figures and stakeholder reports."
        )
        text = " ".join([sentence] * 60)
        chunker = self._new_chunker(target_min=80, target_max=200, overlap=0)
        chunks = _run(chunker.chunk(text))

        self.assertGreater(len(chunks), 1)
        for c in chunks:
            tok = len(self.tokenizer.encode(c))
            # Allow a small slack for sentence-boundary alignment.
            self.assertLessEqual(tok, 250, f"Chunk too large: {tok} tokens")

    def test_corrupted_pdf_text_drops_all_chunks(self):
        # 8 occurrences of /uni triggers the page-level corruption guard.
        garbage = (
            "/uni0BAE /uni0BB0 /uni0BBE /uni0BBF /uni0BC8 "
            "/uni0BAE /uni0BB0 /uni0BBE /uni0BBF /uni0BC8 "
            ".notdef .notdef .notdef "
            "more glyph noise here that is not real text"
        )
        chunker = self._new_chunker()
        chunks = _run(chunker.chunk(garbage))
        self.assertEqual(chunks, [])

    def test_empty_input_returns_empty_list(self):
        chunker = self._new_chunker()
        self.assertEqual(_run(chunker.chunk("")), [])
        self.assertEqual(_run(chunker.chunk("   \n   ")), [])

    # ---------- caching ----------

    def test_repeated_sentences_are_cached(self):
        call_log: List[List[str]] = []

        async def counting_embed(texts: List[str]) -> List[List[float]]:
            call_log.append(list(texts))
            return _bag_of_chars_embed(texts)

        chunker = self._new_chunker(
            embed_fn=counting_embed,
            target_min=10,
            target_max=600,
            overlap=0,
        )
        text = (
            "First sentence about cats. "
            "Second sentence about cats. "
            "First sentence about cats."  # exact dupe of #1
        )
        _run(chunker.chunk(text))

        # Only one provider call, and it was for 2 unique sentences,
        # not 3.
        self.assertEqual(len(call_log), 1)
        self.assertEqual(len(call_log[0]), 2)

        # A second chunk() call on a page that re-uses one of those
        # sentences should make NO new provider calls.
        text2 = "First sentence about cats. A new sentence about dogs."
        _run(chunker.chunk(text2))
        self.assertEqual(len(call_log), 2)
        # Only the new "dogs" sentence was sent.
        self.assertEqual(len(call_log[1]), 1)
        self.assertIn("dogs", call_log[1][0])

    # ---------- per-page sentence cap fallback ----------

    def test_oversized_page_falls_back_to_fixed_chunker(self):
        # 250 sentences > cap of 5, so we must NOT call the embedder.
        called = {"n": 0}

        async def must_not_be_called(texts):
            called["n"] += 1
            return _bag_of_chars_embed(texts)

        chunker = self._new_chunker(
            embed_fn=must_not_be_called,
            target_min=80,
            target_max=200,
            overlap=0,
            max_sentences=5,
        )
        # Each "sentence" must clear the 30-char corruption floor.
        sentence = (
            "This is a moderately long sentence about widgets and gadgets."
        )
        text = " ".join([sentence] * 250)
        chunks = _run(chunker.chunk(text))

        self.assertEqual(called["n"], 0, "embedder must not be called")
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            tok = len(self.tokenizer.encode(c))
            self.assertLessEqual(tok, 220)

    # ---------- overlap ----------

    def test_overlap_tokens_are_added_between_chunks(self):
        # Force two chunks via topic split, with 50-token overlap.
        topic_a = (
            "Pizza dough rests overnight before baking. " * 30
        )
        topic_b = (
            "Quantum computers use superposition for parallelism. " * 30
        )
        text = topic_a + topic_b
        embedder = _TopicEmbedder(
            [
                (0, ["pizza", "dough", "baking"]),
                (1, ["quantum", "superposition", "parallelism"]),
            ]
        )
        chunker = self._new_chunker(
            embed_fn=embedder.aembed,
            target_min=80,
            target_max=400,
            overlap=40,
        )
        chunks = _run(chunker.chunk(text))
        self.assertGreaterEqual(len(chunks), 2)
        # The second chunk should contain at least some pizza vocabulary
        # bleeding in from the overlap window.
        self.assertIn("pizza", chunks[1].lower())


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


class SemanticChunkerValidationTests(unittest.TestCase):
    def test_invalid_target_bounds_raises(self):
        with self.assertRaises(ValueError):
            SemanticChunker(target_min=400, target_max=300)
        with self.assertRaises(ValueError):
            SemanticChunker(target_min=0, target_max=600)

    def test_invalid_overlap_raises(self):
        with self.assertRaises(ValueError):
            SemanticChunker(target_min=300, target_max=600, overlap_tokens=-1)
        with self.assertRaises(ValueError):
            SemanticChunker(target_min=300, target_max=600, overlap_tokens=300)


class ContentProcessorIntegrationTests(unittest.TestCase):
    """Lock in that ``ContentProcessor._chunk_text`` invokes the
    semantic chunker (when enabled) and that the legacy fixed-token
    path still works when the flag is off.
    """

    def setUp(self):
        # Lazy import — the module imports web_scraper which can drag
        # in optional deps. The conftest.py at the repo root has
        # already prepared sys.path for this.
        from backend.ingestion.content_processor import ContentProcessor

        self.ContentProcessor = ContentProcessor

    def test_chunk_text_uses_semantic_chunker_when_enabled(self):
        called = {"n": 0}

        async def fake_embed(texts: List[str]) -> List[List[float]]:
            called["n"] += 1
            return _bag_of_chars_embed(texts)

        tokenizer = tiktoken.get_encoding("cl100k_base")
        chunker = SemanticChunker(
            target_min=80,
            target_max=300,
            overlap_tokens=20,
            similarity_threshold=0.5,
            embedding_fn=fake_embed,
            tokenizer=tokenizer,
        )
        proc = self.ContentProcessor(semantic_chunker=chunker)
        text = (
            "The first paragraph talks about cats. "
            "Cats are furry mammals. They purr when content. "
        ) * 6
        chunks = proc._chunk_text(text)

        self.assertGreaterEqual(len(chunks), 1)
        self.assertGreater(called["n"], 0, "semantic chunker should embed")

    def test_chunk_text_filters_corrupted_chunks(self):
        async def fake_embed(texts):
            return _bag_of_chars_embed(texts)

        tokenizer = tiktoken.get_encoding("cl100k_base")
        chunker = SemanticChunker(
            target_min=80,
            target_max=300,
            overlap_tokens=20,
            similarity_threshold=0.5,
            embedding_fn=fake_embed,
            tokenizer=tokenizer,
        )
        proc = self.ContentProcessor(semantic_chunker=chunker)

        # Whole-page corruption signature.
        garbage = (
            "/uni0BAE /uni0BB0 /uni0BBE /uni0BBF /uni0BC8 /uni0BAE "
            "/uni0BB0 /uni0BBE garbage glyph stream not real content"
        )
        self.assertEqual(proc._chunk_text(garbage), [])


if __name__ == "__main__":
    unittest.main()
