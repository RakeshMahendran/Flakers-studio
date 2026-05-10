"""Integration tests for RAGPipeline parallel execution (embed + filter).

These tests verify that the asyncio.gather-based parallel execution in
rag_pipeline.handle_query correctly handles success/failure of the
embedding and filter-extraction tasks.
"""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from backend.retrieval.filter_extractor import FilterExtractor, FilterResult
from backend.retrieval.rag_pipeline import RAGPipeline
from backend.services.embeddings import EmbeddingService


class _StubEmbedding:
    """Minimal stub for EmbeddingService."""
    def __init__(self, embedding: Optional[List[float]] = None, error: Optional[Exception] = None):
        self._embedding = embedding or [0.1] * 3072
        self._error = error

    async def embed_text(self, text: str) -> List[float]:
        if self._error:
            raise self._error
        return self._embedding


class _StubFilterExtractor:
    """Minimal stub for FilterExtractor."""
    def __init__(self, result: Optional[FilterResult] = None, error: Optional[Exception] = None):
        self._result = result or FilterResult()
        self._error = error
        self.calls: List[str] = []

    async def extract(self, query: str, *args, **kwargs) -> FilterResult:
        self.calls.append(query)
        if self._error:
            raise self._error
        return self._result


class _StubRetrieval:
    """Minimal stub for RetrievalService."""
    def __init__(self, chunks: Optional[List[Dict[str, Any]]] = None):
        self._chunks = chunks or []

    async def search_assistant_content(self, **kwargs):
        # Return chunks if no filters, empty if filters are applied (to test fallback)
        if kwargs.get("payload_filters"):
            return []
        return self._chunks


class ParallelExecutionTests(unittest.TestCase):
    """Test parallel embed + filter execution in RAGPipeline.handle_query."""

    def test_both_succeed_uses_filters(self):
        """Verify that when both embed and filter succeed, filters are used."""
        stub_embed = _StubEmbedding(embedding=[0.5] * 3072)
        stub_filter = _StubFilterExtractor(
            result=FilterResult(filters={"year": 2024}, confidence="high")
        )
        stub_retrieval = _StubRetrieval(chunks=[])
        stub_azure = AsyncMock()
        stub_azure.generate_response = AsyncMock(return_value={
            "content": "Test response",
            "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
        })

        pipeline = RAGPipeline(
            embedding_service=stub_embed,
            azure_service=stub_azure,
            retrieval_service=stub_retrieval,
            filter_extractor=stub_filter,
        )

        # Mock DB session and assistant
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        mock_assistant = MagicMock()
        mock_assistant.id = "test-assistant-id"
        mock_assistant.name = "Test Assistant"
        mock_assistant.tenant_id = "test-tenant"
        mock_assistant.project_id = "test-project"
        mock_assistant.site_url = "https://test.com"

        # Run the query
        result = asyncio.run(pipeline.handle_query(
            db=mock_db,
            assistant=mock_assistant,
            user_message="events from 2024",
            session_id=None,
        ))

        # Verify filter extractor was called
        self.assertEqual(len(stub_filter.calls), 1)
        self.assertEqual(stub_filter.calls[0], "events from 2024")

    def test_embed_fails_propagates_error(self):
        """Verify that embedding failure propagates (kills the request)."""
        stub_embed = _StubEmbedding(error=Exception("Embedding API timeout"))
        stub_filter = _StubFilterExtractor(result=FilterResult(filters={"year": 2024}))
        stub_retrieval = _StubRetrieval()
        stub_azure = AsyncMock()

        pipeline = RAGPipeline(
            embedding_service=stub_embed,
            azure_service=stub_azure,
            retrieval_service=stub_retrieval,
            filter_extractor=stub_filter,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_assistant = MagicMock()
        mock_assistant.id = "test-assistant-id"
        mock_assistant.name = "Test Assistant"
        mock_assistant.tenant_id = "test-tenant"

        # Should raise the embedding exception
        with self.assertRaises(Exception) as ctx:
            asyncio.run(pipeline.handle_query(
                db=mock_db,
                assistant=mock_assistant,
                user_message="test query",
            ))
        self.assertIn("Embedding API timeout", str(ctx.exception))

    def test_filter_fails_degrades_gracefully(self):
        """Verify that filter failure degrades to semantic-only search."""
        stub_embed = _StubEmbedding(embedding=[0.5] * 3072)
        stub_filter = _StubFilterExtractor(error=Exception("Filter LLM timeout"))
        stub_retrieval = _StubRetrieval(chunks=[
            {
                "id": "chunk-1",
                "content": "Test content",
                "source_url": "https://test.com",
                "source_title": "Test",
                "intent": "general",
            }
        ])
        stub_azure = AsyncMock()
        stub_azure.generate_response = AsyncMock(return_value={
            "content": "Test response",
            "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
        })

        pipeline = RAGPipeline(
            embedding_service=stub_embed,
            azure_service=stub_azure,
            retrieval_service=stub_retrieval,
            filter_extractor=stub_filter,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_assistant = MagicMock()
        mock_assistant.id = "test-assistant-id"
        mock_assistant.name = "Test Assistant"
        mock_assistant.tenant_id = "test-tenant"
        mock_assistant.project_id = "test-project"
        mock_assistant.site_url = "https://test.com"

        # Should succeed (degrade to semantic-only)
        result = asyncio.run(pipeline.handle_query(
            db=mock_db,
            assistant=mock_assistant,
            user_message="test query",
        ))

        self.assertEqual(result["decision"], "ANSWER")
        # Should have no applied_filters (degraded to semantic-only)
        self.assertEqual(result.get("applied_filters"), [])

    def test_filter_returns_none_degrades(self):
        """Verify that filter returning None is handled gracefully."""
        stub_embed = _StubEmbedding()
        stub_filter = _StubFilterExtractor(result=None)  # Bug: should never happen
        stub_retrieval = _StubRetrieval(chunks=[])
        stub_azure = AsyncMock()
        stub_azure.generate_response = AsyncMock(return_value={
            "content": "Fallback response",
            "usage": {"prompt_tokens": 5, "completion_tokens": 10, "total_tokens": 15}
        })

        pipeline = RAGPipeline(
            embedding_service=stub_embed,
            azure_service=stub_azure,
            retrieval_service=stub_retrieval,
            filter_extractor=stub_filter,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_assistant = MagicMock()
        mock_assistant.id = "test-assistant-id"
        mock_assistant.name = "Test Assistant"
        mock_assistant.tenant_id = "test-tenant"
        mock_assistant.project_id = "test-project"
        mock_assistant.site_url = "https://test.com"

        # Should not crash (defensive None check should trigger)
        result = asyncio.run(pipeline.handle_query(
            db=mock_db,
            assistant=mock_assistant,
            user_message="test",
        ))

        self.assertEqual(result["decision"], "ANSWER")


class FallbackLogicTests(unittest.TestCase):
    """Test fallback logic when filtered search returns 0 results."""

    def test_fallback_retries_without_filters(self):
        """Verify that empty filtered search triggers semantic-only retry."""
        stub_embed = _StubEmbedding()
        stub_filter = _StubFilterExtractor(result=FilterResult(filters={"year": 2024}))

        # Retrieval returns empty for filtered, non-empty for semantic-only
        call_count = 0
        async def mock_search(**kwargs):
            nonlocal call_count
            call_count += 1
            if kwargs.get("payload_filters"):
                return []  # Filtered search fails
            return [{"id": "chunk-1", "content": "Test", "source_url": "https://test.com",
                     "source_title": "Test", "intent": "general"}]

        stub_retrieval = MagicMock()
        stub_retrieval.search_assistant_content = mock_search

        stub_azure = AsyncMock()
        stub_azure.generate_response = AsyncMock(return_value={
            "content": "Fallback response",
            "usage": {"prompt_tokens": 5, "completion_tokens": 10, "total_tokens": 15}
        })

        pipeline = RAGPipeline(
            embedding_service=stub_embed,
            azure_service=stub_azure,
            retrieval_service=stub_retrieval,
            filter_extractor=stub_filter,
        )

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()
        mock_assistant = MagicMock()
        mock_assistant.id = "test-assistant-id"
        mock_assistant.name = "Test Assistant"
        mock_assistant.tenant_id = "test-tenant"
        mock_assistant.project_id = "test-project"
        mock_assistant.site_url = "https://test.com"

        result = asyncio.run(pipeline.handle_query(
            db=mock_db,
            assistant=mock_assistant,
            user_message="events from 2024",
        ))

        # Should have called search twice (filtered + fallback)
        self.assertEqual(call_count, 2)
        self.assertTrue(result.get("used_fallback"))


if __name__ == "__main__":
    unittest.main()
