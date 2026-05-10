"""
Semantic / hybrid chunker.

Replaces the legacy fixed-token chunker with a topic-aware chunker:

1. Split a page into sentences via a regex (cheap, no nltk dependency).
2. Embed each sentence with the configured embeddings provider.
3. Compute cosine similarity between adjacent sentences.
4. Mark a "topic boundary" wherever similarity drops below a threshold.
5. Group consecutive sentences into chunks of ``target_min``-``target_max``
   tokens (cl100k_base token count). Chunks above the cap are split at the
   next-best boundary; chunks under the floor are merged into a neighbour.
6. Add a fixed token-overlap between adjacent chunks so retrieval is not
   sliced exactly on a topic boundary.

Corruption guard:
    PDF extraction frequently emits glyph-stream junk like ``/uni0BAE`` or
    ``.notdef`` runs. Such "chunks" are useless for retrieval and waste
    embedding tokens, so ``is_corrupted_chunk`` is checked at the page
    level (before embedding) AND at the chunk level (after assembly).

Design notes:
    * Embedding the same sentence twice is wasted spend, so this module
      keeps a per-instance embedding cache keyed on the sentence string.
      Pass the same ``SemanticChunker`` across all pages of a single
      ingestion run to share the cache.
    * Per-page sentence cap (default 200): pages with more sentences fall
      back to the legacy fixed-token chunker. Embedding a 5,000-sentence
      Wikipedia dump in semantic mode would be both slow and expensive.
"""
from __future__ import annotations

import logging
import math
import re
from typing import Awaitable, Callable, Dict, List, Optional, Sequence

import tiktoken

logger = logging.getLogger(__name__)

EmbeddingFn = Callable[[List[str]], Awaitable[List[List[float]]]]

# Sentence splitter:
#   - splits on . ! ? followed by whitespace + capital / digit / quote
#   - handles common abbreviations by NOT splitting on a single capital
#     letter followed by a period (e.g. "Dr." stays attached)
# This is intentionally simple. nltk's punkt is more accurate but adds a
# dependency and a model download; for chunking purposes the regex is fine.
_SENTENCE_END_RE = re.compile(
    r"(?<=[.!?])\s+(?=[A-Z0-9\"'\(\[])"
)

# Hard sentence-length safety net. A "sentence" longer than this many
# characters is almost certainly a wall of unparsed text (table dump,
# minified JSON, etc). We force-split it on whitespace so it doesn't
# blow past the embedding token limit.
_MAX_SENTENCE_CHARS = 2000


def is_corrupted_chunk(text: str) -> bool:
    """Heuristic detector for PDF / extraction garbage.

    Returns True if any of the following hold:
        - more than 5 occurrences of ``/uni`` (Tamil/Indic glyph stream)
        - more than 2 occurrences of ``.notdef`` (font fallback marker)
        - any null byte (binary leakage)
        - stripped length under 30 characters (not enough signal)

    Apply BEFORE embedding to save token spend on garbage.
    """
    if not isinstance(text, str):
        return True
    if text.count("/uni") > 5:
        return True
    if text.count(".notdef") > 2:
        return True
    if "\x00" in text:
        return True
    if len(text.strip()) < 30:
        return True
    return False


def split_sentences(text: str) -> List[str]:
    """Split ``text`` into a list of trimmed sentences.

    Empty / whitespace-only input returns ``[]``. Very long "sentences"
    are force-split on whitespace at ``_MAX_SENTENCE_CHARS``.
    """
    if not text or not text.strip():
        return []

    parts = _SENTENCE_END_RE.split(text.strip())
    sentences: List[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) <= _MAX_SENTENCE_CHARS:
            sentences.append(part)
            continue
        # Defensive split for run-on text (no terminal punctuation).
        words = part.split()
        buf: List[str] = []
        cur_len = 0
        for w in words:
            cur_len += len(w) + 1
            buf.append(w)
            if cur_len >= _MAX_SENTENCE_CHARS:
                sentences.append(" ".join(buf))
                buf = []
                cur_len = 0
        if buf:
            sentences.append(" ".join(buf))
    return sentences


def _cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity between two equal-length numeric sequences.

    Returns 0.0 if either vector is zero-length or the norm is zero.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


class SemanticChunker:
    """Hybrid semantic / fixed-token chunker.

    Args:
        target_min: lower token bound for an output chunk; chunks below
            this floor are merged into a neighbour.
        target_max: upper token bound; oversized groups are split at the
            next-strongest internal boundary.
        overlap_tokens: number of trailing tokens of chunk N prepended to
            chunk N+1 to reduce retrieval cliff-edges.
        similarity_threshold: cosine threshold below which we mark a
            topic boundary between two adjacent sentences.
        max_sentences_per_page: pages with more sentences than this fall
            back to ``_fallback_fixed_chunk``. Embedding cost guard.
        embedding_fn: async callable ``List[str] -> List[List[float]]``.
            Defaulted lazily to ``EmbeddingService().embed_texts`` so
            tests can inject a fake without importing Azure.
        tokenizer: a tiktoken Encoding. Defaulted to ``cl100k_base``.
        max_cache_size: maximum number of sentence embeddings to cache.
            When exceeded, the cache is cleared to prevent unbounded
            memory growth. Default 10000 sentences (~40MB for 1536-dim).
    """

    def __init__(
        self,
        target_min: int = 300,
        target_max: int = 600,
        overlap_tokens: int = 100,
        similarity_threshold: float = 0.5,
        max_sentences_per_page: int = 200,
        embedding_fn: Optional[EmbeddingFn] = None,
        tokenizer: Optional["tiktoken.Encoding"] = None,
        max_cache_size: int = 10000,
    ) -> None:
        if target_min <= 0 or target_max <= target_min:
            raise ValueError("target_max must be greater than target_min > 0")
        if overlap_tokens < 0 or overlap_tokens >= target_min:
            raise ValueError("overlap_tokens must be in [0, target_min)")
        if max_cache_size < 0:
            raise ValueError("max_cache_size must be non-negative")
        self.target_min = target_min
        self.target_max = target_max
        self.overlap_tokens = overlap_tokens
        self.similarity_threshold = similarity_threshold
        self.max_sentences_per_page = max_sentences_per_page
        self.max_cache_size = max_cache_size
        self._embedding_fn = embedding_fn
        self.tokenizer = tokenizer or tiktoken.get_encoding("cl100k_base")
        # Cache: sentence text -> embedding vector. Survives across
        # ``chunk()`` calls on the same instance, so use one chunker
        # instance per ingestion run.
        self._embedding_cache: Dict[str, List[float]] = {}

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    async def chunk(self, text: str) -> List[str]:
        """Split ``text`` into 300-600 token semantic chunks.

        Falls back to a fixed-token chunker if:
            * input is whole-page corrupted, or
            * the page has more sentences than ``max_sentences_per_page``.

        The returned chunks are post-filtered through
        ``is_corrupted_chunk`` so callers do not need to filter again.
        """
        if not text or not text.strip():
            return []

        # Whole-page corruption guard: skip embedding entirely.
        if is_corrupted_chunk(text):
            logger.warning(
                "Skipping page entirely: full-page corruption signature detected"
            )
            return []

        sentences = split_sentences(text)
        if not sentences:
            return []

        if len(sentences) == 1:
            # Nothing to compare against; return as one chunk if it's
            # within size budget, otherwise hard-split it.
            return self._enforce_size_budget([sentences[0]])

        if len(sentences) > self.max_sentences_per_page:
            logger.warning(
                "Page has %d sentences (cap=%d); falling back to fixed-token "
                "chunker to control embedding spend",
                len(sentences),
                self.max_sentences_per_page,
            )
            return self._fallback_fixed_chunk(text)

        # Embed sentences (cached) and compute adjacency similarities.
        embeddings = await self._embed_sentences(sentences)
        boundaries = self._find_boundaries(embeddings)

        # Group sentences between boundaries.
        groups = self._group_by_boundaries(sentences, boundaries)

        # Enforce the 300-600 token window: split oversize groups,
        # merge tiny ones.
        chunks = self._enforce_size_budget(groups)

        # Add overlap between consecutive chunks.
        chunks = self._apply_overlap(chunks)

        # Final corruption pass — drop any chunk that turned out to be
        # garbage even after grouping (e.g. chunks of mostly /uni glyphs).
        return [c for c in chunks if not is_corrupted_chunk(c)]

    # ------------------------------------------------------------------ #
    # Internals                                                          #
    # ------------------------------------------------------------------ #

    def _token_count(self, text: str) -> int:
        if not text:
            return 0
        return len(self.tokenizer.encode(text))

    async def _embed_sentences(self, sentences: List[str]) -> List[List[float]]:
        """Embed sentences, using ``self._embedding_cache`` to dedupe.

        Only the cache misses (deduped within this call too, so a
        sentence that appears 3 times in one page is still embedded
        once) are sent to the embedding provider.
        """
        unique_misses: List[str] = []
        seen_misses = set()
        for s in sentences:
            if s in self._embedding_cache or s in seen_misses:
                continue
            seen_misses.add(s)
            unique_misses.append(s)

        if unique_misses:
            fn = self._get_embedding_fn()
            try:
                new_vectors = await fn(unique_misses)
            except Exception as e:
                logger.error(
                    "Embedding provider failed for %d sentences: %s",
                    len(unique_misses),
                    e,
                )
                raise RuntimeError(
                    f"Embedding provider failed: {str(e)}"
                ) from e

            if len(new_vectors) != len(unique_misses):
                raise RuntimeError(
                    f"Embedding provider returned {len(new_vectors)} "
                    f"vectors for {len(unique_misses)} sentences"
                )
            for s, v in zip(unique_misses, new_vectors):
                if not isinstance(v, (list, tuple)) or len(v) == 0:
                    raise RuntimeError(
                        f"Invalid embedding vector returned for sentence "
                        f"(expected non-empty sequence, got {type(v).__name__})"
                    )
                self._embedding_cache[s] = v

            # Memory guard: clear cache if it grows too large
            if (
                self.max_cache_size > 0
                and len(self._embedding_cache) > self.max_cache_size
            ):
                logger.warning(
                    "Embedding cache exceeded max size (%d > %d); clearing cache",
                    len(self._embedding_cache),
                    self.max_cache_size,
                )
                self._embedding_cache.clear()

        return [self._embedding_cache[s] for s in sentences]

    def _get_embedding_fn(self) -> EmbeddingFn:
        if self._embedding_fn is not None:
            return self._embedding_fn
        # Lazy default. Importing at module level would force every
        # caller (including unit tests) to load Azure config.
        from backend.services.embeddings import EmbeddingService

        service = EmbeddingService()
        self._embedding_fn = service.embed_texts
        return self._embedding_fn

    def _find_boundaries(self, embeddings: List[List[float]]) -> List[int]:
        """Return indices ``i`` such that the boundary lies BEFORE
        sentence ``i``. Index 0 is implicit (always a boundary).
        """
        if len(embeddings) < 2:
            return []

        boundaries: List[int] = []
        for i in range(1, len(embeddings)):
            try:
                sim = _cosine_similarity(embeddings[i - 1], embeddings[i])
                if sim < self.similarity_threshold:
                    boundaries.append(i)
            except (ValueError, ZeroDivisionError) as e:
                logger.warning(
                    "Failed to compute similarity at index %d: %s. "
                    "Treating as boundary.",
                    i,
                    e,
                )
                boundaries.append(i)
        return boundaries

    def _group_by_boundaries(
        self, sentences: List[str], boundaries: List[int]
    ) -> List[str]:
        """Concatenate sentences into groups separated by ``boundaries``."""
        if not sentences:
            return []
        cuts = [0] + list(boundaries) + [len(sentences)]
        groups: List[str] = []
        for start, end in zip(cuts[:-1], cuts[1:]):
            piece = " ".join(sentences[start:end]).strip()
            if piece:
                groups.append(piece)
        return groups

    # A chunk smaller than this is too tiny to stand on its own and
    # MUST be merged into a neighbour (even if the merge briefly
    # exceeds target_max). Anything between this floor and target_min
    # only gets merged when the combined size still fits in target_max.
    _MIN_STANDALONE_TOKENS = 100

    def _enforce_size_budget(self, groups: List[str]) -> List[str]:
        """Apply the 300/600 token bounds to a list of pre-grouped strings.

        * Groups over ``target_max``: split on sentence boundaries at
          the next-best position.
        * Groups under ``target_min``: merged into a neighbour when the
          combined size still fits in ``target_max``.
        * Groups under ``_MIN_STANDALONE_TOKENS`` (the hard floor): we
          merge regardless, even if that briefly exceeds target_max,
          rather than ship a useless 30-token chunk.
        """
        if not groups:
            return []

        # First, hard-split anything above the ceiling.
        capped: List[str] = []
        for g in groups:
            if not g or not g.strip():
                continue
            capped.extend(self._split_oversize(g))

        if not capped:
            return []

        # Now merge undersize chunks into neighbours.
        merged: List[str] = []
        for piece in capped:
            if not piece or not piece.strip():
                continue
            tok = self._token_count(piece)
            if tok < self.target_min and merged:
                combined = (merged[-1] + " " + piece).strip()
                combined_tok = self._token_count(combined)
                if combined_tok <= self.target_max:
                    merged[-1] = combined
                    continue
                # Soft cap exceeded — accept the merge anyway when the
                # standalone chunk would be useless garbage size.
                if tok < self._MIN_STANDALONE_TOKENS:
                    merged[-1] = combined
                    continue
            merged.append(piece)

        # Pass 2: any leading short chunk (no previous to merge into
        # at insertion time) gets merged forward into the next chunk
        # if it fits, or unconditionally if it is below the hard floor.
        if len(merged) >= 2:
            head_tok = self._token_count(merged[0])
            if head_tok < self.target_min:
                combined = (merged[0] + " " + merged[1]).strip()
                combined_tok = self._token_count(combined)
                if (
                    combined_tok <= self.target_max
                    or head_tok < self._MIN_STANDALONE_TOKENS
                ):
                    merged = [combined] + merged[2:]

        return merged

    def _split_oversize(self, text: str) -> List[str]:
        """Split a too-long string at sentence boundaries.

        We split greedily: pack sentences into a buffer until adding the
        next one would exceed ``target_max``, then start a new buffer.
        Sentences that are themselves over the cap are token-sliced.
        """
        if not text or not text.strip():
            return []

        if self._token_count(text) <= self.target_max:
            return [text]

        sentences = split_sentences(text)
        if not sentences:
            return self._token_slice(text)

        out: List[str] = []
        buf: List[str] = []
        buf_tokens = 0
        for s in sentences:
            if not s or not s.strip():
                continue
            s_tokens = self._token_count(s)
            if s_tokens > self.target_max:
                # Flush current buf, then hard-slice the runaway sentence.
                if buf:
                    out.append(" ".join(buf))
                    buf, buf_tokens = [], 0
                out.extend(self._token_slice(s))
                continue
            # Account for space separator in token count when adding to buffer
            space_adjustment = 1 if buf else 0
            if buf_tokens + s_tokens + space_adjustment > self.target_max:
                if buf:
                    out.append(" ".join(buf))
                buf, buf_tokens = [s], s_tokens
            else:
                buf.append(s)
                # Recalculate exact token count for buffer to avoid drift
                buf_tokens = self._token_count(" ".join(buf))
        if buf:
            out.append(" ".join(buf))
        return out

    def _token_slice(self, text: str) -> List[str]:
        """Last-resort: slice a string by raw tokens at ``target_max``."""
        tokens = self.tokenizer.encode(text)
        if not tokens:
            return []
        out: List[str] = []
        for i in range(0, len(tokens), self.target_max):
            piece = self.tokenizer.decode(tokens[i : i + self.target_max])
            piece = piece.strip()
            if piece:
                out.append(piece)
        return out

    def _apply_overlap(self, chunks: List[str]) -> List[str]:
        """Prepend the last ``overlap_tokens`` of chunk N to chunk N+1."""
        if self.overlap_tokens <= 0 or len(chunks) < 2:
            return chunks

        out: List[str] = [chunks[0]]
        for prev, cur in zip(chunks[:-1], chunks[1:]):
            if not prev or not cur:
                out.append(cur if cur else "")
                continue
            prev_tokens = self.tokenizer.encode(prev)
            # Guard: if the previous chunk has fewer tokens than overlap_tokens,
            # use all available tokens instead of negative indexing.
            overlap_start = max(0, len(prev_tokens) - self.overlap_tokens)
            tail_tokens = prev_tokens[overlap_start:]
            tail = self.tokenizer.decode(tail_tokens).strip()
            if tail:
                out.append((tail + " " + cur).strip())
            else:
                out.append(cur)
        return out

    def _fallback_fixed_chunk(self, text: str) -> List[str]:
        """Legacy fixed-token chunker, used when semantic chunking is
        infeasible (oversize page, etc).
        """
        if not text or not text.strip():
            return []

        tokens = self.tokenizer.encode(text)
        if not tokens:
            return []

        if len(tokens) <= self.target_max:
            stripped = text.strip()
            if stripped and not is_corrupted_chunk(stripped):
                return [stripped]
            return []

        chunks: List[str] = []
        step = self.target_max - self.overlap_tokens
        if step <= 0:
            logger.warning(
                "overlap_tokens (%d) >= target_max (%d); using step=target_max",
                self.overlap_tokens,
                self.target_max,
            )
            step = self.target_max

        start = 0
        while start < len(tokens):
            end = start + self.target_max
            piece = self.tokenizer.decode(tokens[start:end]).strip()
            if piece and not is_corrupted_chunk(piece):
                chunks.append(piece)
            if end >= len(tokens):
                break
            start += step
        return chunks
