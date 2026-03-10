"""
Ingestion Service - Process and index content
Takes already-scraped content from database, generates embeddings, and uploads to vector DB
"""
from typing import List, Dict, Any, Optional
import uuid
import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from backend.models.content import IngestionJob, ContentChunk, JobStatus
from backend.models.ingestion_tracking import IngestionURL, IngestionChunk, URLStatus, ChunkStatus
from backend.models.assistant import Assistant, AssistantStatus
from backend.ingestion.content_processor import ContentProcessor
from backend.ingestion.cancellation import CancellationException
from backend.config.logging import log_context
from backend.observability.metrics import observe_ingestion
from backend.services.embeddings import EmbeddingService
from backend.vector_providers.qdrant_provider import store_embeddings, ensure_assistant_collection
from backend.config.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

class IngestionService:
    """
    Processes discovered content into searchable chunks
    
    This service:
    1. Reads scraped content from database (from discovery phase)
    2. Chunks content appropriately
    3. Classifies content by intent
    4. Generates embeddings
    5. Stores in Qdrant and database
    """
    
    def __init__(self):
        self.processor = ContentProcessor()
        self.embedding_service = EmbeddingService()

    async def _raise_if_cancelled(self, db: AsyncSession, job_id: str, operation: str) -> IngestionJob:
        job = await db.get(IngestionJob, job_id)
        if not job:
            raise Exception(f"Job {job_id} not found")
        if job.should_cancel():
            raise CancellationException(f"Job {job_id} cancelled during {operation}")
        return job

    @staticmethod
    def _append_job_error(job: IngestionJob, message: str) -> None:
        details = list(job.error_details or [])
        details.append({"error": message, "timestamp": datetime.utcnow().isoformat()})
        job.error_details = details
        job.errors_count = int(job.errors_count or 0) + 1

    async def _mark_job_cancelled(
        self,
        db: AsyncSession,
        job_id: str,
        reason: Optional[str] = None,
    ) -> None:
        job = await db.get(IngestionJob, job_id)
        if not job:
            return

        if job.status != JobStatus.CANCELLED.value:
            job.status = JobStatus.CANCELLED.value
            job.current_stage = "cancelled"
            job.cancelled_at = datetime.utcnow()
            if reason and not job.cancellation_reason:
                job.cancellation_reason = reason
            await db.commit()

        assistant = await db.get(Assistant, job.assistant_id)
        if assistant:
            assistant.status = AssistantStatus.ERROR
            assistant.status_message = "Content ingestion cancelled"
            await db.commit()

        duration_seconds = None
        if job.started_at:
            duration_seconds = max((datetime.utcnow() - job.started_at.replace(tzinfo=None)).total_seconds(), 0.0)
        observe_ingestion("cancelled", duration_seconds)

    async def _mark_job_failed(self, db: AsyncSession, job_id: str, message: str) -> None:
        job = await db.get(IngestionJob, job_id)
        if not job:
            return

        job.status = JobStatus.FAILED.value
        job.current_stage = "failed"
        job.completed_at = datetime.utcnow()
        self._append_job_error(job, message)
        await db.commit()

        assistant = await db.get(Assistant, job.assistant_id)
        if assistant:
            assistant.status = AssistantStatus.ERROR
            assistant.status_message = "Content ingestion failed"
            await db.commit()

        duration_seconds = None
        if job.started_at:
            duration_seconds = max((datetime.utcnow() - job.started_at.replace(tzinfo=None)).total_seconds(), 0.0)
        observe_ingestion("failed", duration_seconds)
    
    async def start_ingestion(
        self,
        job_id: str,
        assistant_id: str,
        assistant_name: str,
        user_name: str
    ) -> bool:
        """
        Start ingestion job - processes scraped content and uploads to vector DB
        
        Args:
            job_id: Discovery job ID (contains scraped content)
            assistant_id: Assistant UUID
            assistant_name: Assistant name for collection naming
            user_name: User name for collection naming
            
        Returns:
            True if started successfully
        """
        # Start background processing
        asyncio.create_task(
            self._process_ingestion(job_id, assistant_id, assistant_name, user_name)
        )
        
        logger.info(f"Started ingestion for job {job_id}")
        return True
    
    async def _process_ingestion(
        self,
        job_id: str,
        assistant_id: str,
        assistant_name: str,
        user_name: str
    ):
        """Background ingestion processing - reads from DB, generates embeddings, uploads to vector DB"""
        try:
            async with AsyncSessionLocal() as db:
                job = await db.get(IngestionJob, job_id)
                
                if not job:
                    raise Exception(f"Job {job_id} not found")
                with log_context(tenant_id=str(job.tenant_id), assistant_id=str(job.assistant_id)):
                
                    # Guard: Skip if job is already completed or if ingestion is already in progress
                    if job.status == JobStatus.COMPLETED.value:
                        logger.warning(f"Job {job_id} is already completed, skipping duplicate ingestion")
                        return
                    
                    if job.current_stage in ["processing", "embedding", "ingestion", "storing"]:
                        logger.warning(f"Job {job_id} ingestion is already in progress (stage: {job.current_stage}), skipping duplicate")
                        return
                    if job.should_cancel():
                        await self._mark_job_cancelled(db, job_id, job.cancellation_reason)
                        return
                    
                    # Update job status
                    job.status = JobStatus.RUNNING.value
                    job.current_stage = "processing"
                    await db.commit()
                    
                    # Get scraped URLs from database
                    result = await db.execute(
                        select(IngestionURL)
                        .where(
                            IngestionURL.job_id == job_id,
                            IngestionURL.status.in_([URLStatus.SCRAPED.value, URLStatus.PROCESSED.value])
                        )
                    )
                    scraped_urls = result.scalars().all()
                    
                    if not scraped_urls:
                        raise Exception("No scraped content found in database")
                    
                    logger.info(f"Job {job_id}: Processing {len(scraped_urls)} scraped pages")
                    
                    # Process each URL into chunks
                    all_chunks = []
                    for url_record in scraped_urls:
                        await self._raise_if_cancelled(db, job_id, f"processing {url_record.url}")
                        # Create ScrapedPage object for processor
                        from backend.ingestion.web_scraper import ScrapedPage
                        scraped_page = ScrapedPage(
                            url=url_record.url,
                            title=url_record.title or "",
                            content=url_record.raw_content,
                            meta_description="",
                            links=[],
                            images=[],
                            content_type=url_record.content_type or "general",
                            scraped_at=url_record.scraped_at or datetime.utcnow(),
                            content_hash=""
                        )
                        
                        # Process into chunks
                        processed_chunks = self.processor.process_scraped_pages([scraped_page])
                        all_chunks.extend(processed_chunks)
                        
                        # Update URL status
                        url_record.status = URLStatus.PROCESSED.value
                        url_record.chunk_count = len(processed_chunks)
                        url_record.processed_at = datetime.utcnow()
                    
                    job.total_chunks_created = len(all_chunks)
                    job.urls_processed = len(scraped_urls)
                    await db.commit()
                    
                    logger.info(f"Job {job_id}: Generated {len(all_chunks)} chunks")
                    
                    # Generate embeddings
                    await self._raise_if_cancelled(db, job_id, "embedding generation")
                    job.current_stage = "embedding"
                    await db.commit()
                    
                    texts = [chunk.content for chunk in all_chunks]
                    embeddings = await self.embedding_service.embed_texts(texts)
                    
                    logger.info(f"Job {job_id}: Generated {len(embeddings)} embeddings")
                    
                    # Ensure collection exists
                    await self._raise_if_cancelled(db, job_id, "collection provisioning")
                    job.current_stage = "ingestion"
                    await db.commit()
                    
                    await ensure_assistant_collection(assistant_name, user_name)
                    
                    # Prepare chunks for Qdrant
                    qdrant_chunks = []
                    for chunk in all_chunks:
                        qdrant_chunk = {
                            "content": chunk.content,
                            "source_url": chunk.source_url,
                            "source_title": chunk.source_title,
                            "source_type": chunk.source_type,
                            "intent": chunk.intent.value,
                            "confidence_score": chunk.confidence_score,
                            "requires_attribution": chunk.requires_attribution,
                            "is_policy_content": chunk.is_policy_content,
                            "is_sensitive": chunk.is_sensitive,
                            "chunk_index": chunk.chunk_index,
                            "content_hash": chunk.content_hash,
                            "metadata": chunk.metadata
                        }
                        qdrant_chunks.append(qdrant_chunk)
                    
                    # Upload to Qdrant
                    point_ids = await store_embeddings(
                        assistant_id=assistant_id,
                        chunks=qdrant_chunks,
                        embeddings=embeddings,
                        assistant_name=assistant_name,
                        user_name=user_name
                    )
                    
                    job.chunks_uploaded = len(point_ids)
                    await db.commit()
                    
                    logger.info(f"Job {job_id}: Uploaded {len(point_ids)} chunks to Qdrant")
                    
                    # Store in database
                    await self._raise_if_cancelled(db, job_id, "database chunk persistence")
                    job.current_stage = "storing"
                    await db.commit()
                    
                    for chunk, point_id in zip(all_chunks, point_ids):
                        await self._raise_if_cancelled(db, job_id, f"persisting chunk {point_id}")
                        db_chunk = ContentChunk(
                            assistant_id=assistant_id,
                            source_url=chunk.source_url,
                            source_title=chunk.source_title,
                            source_type=chunk.source_type,
                            content=chunk.content,
                            content_hash=chunk.content_hash,
                            intent=chunk.intent.value,
                            confidence_score=chunk.confidence_score,
                            qdrant_point_id=point_id,
                            chunk_index=chunk.chunk_index,
                            chunk_size=chunk.chunk_size,
                            requires_attribution=chunk.requires_attribution,
                            is_policy_content=chunk.is_policy_content,
                            is_sensitive=chunk.is_sensitive
                        )
                        db.add(db_chunk)
                    
                    # Complete the job
                    job.status = JobStatus.COMPLETED.value
                    job.current_stage = "completed"
                    job.urls_completed = len(scraped_urls)
                    job.completed_at = datetime.utcnow()
                    await db.commit()
                    
                    # Update assistant status to READY
                    assistant_result = await db.execute(
                        select(Assistant).where(Assistant.id == assistant_id)
                    )
                    assistant = assistant_result.scalar_one_or_none()
                    
                    if assistant:
                        assistant.status = AssistantStatus.READY
                        assistant.status_message = "Assistant is ready for chat"
                        assistant.total_chunks_indexed = str(len(all_chunks))
                        assistant.total_pages_crawled = str(len(scraped_urls))
                        assistant.last_ingestion_at = datetime.utcnow()
                        await db.commit()
                        logger.info(f"Assistant {assistant_id} status updated to READY")
                    
                    duration_seconds = None
                    if job.started_at:
                        duration_seconds = max((datetime.utcnow() - job.started_at.replace(tzinfo=None)).total_seconds(), 0.0)
                    observe_ingestion("completed", duration_seconds)
                    logger.info(f"Job {job_id}: Ingestion completed successfully")
                
        except CancellationException as e:
            logger.info(f"Job {job_id}: Ingestion cancelled - {str(e)}")
            try:
                async with AsyncSessionLocal() as db:
                    await self._mark_job_cancelled(db, job_id, str(e))
            except Exception as db_error:
                logger.error(f"Failed to update cancelled job status: {str(db_error)}")
        except Exception as e:
            logger.error(f"Job {job_id}: Ingestion failed - {str(e)}", exc_info=True)
            
            # Update job status to failed
            try:
                async with AsyncSessionLocal() as db:
                    await self._mark_job_failed(db, job_id, str(e))
            except Exception as db_error:
                logger.error(f"Failed to update job status: {str(db_error)}")
