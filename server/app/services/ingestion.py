"""
Ingestion Service - Process and index content
Takes already-scraped content from database, generates embeddings, and uploads to vector DB
"""
from typing import List, Dict, Any
import uuid
import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.models.content import IngestionJob, ContentChunk, JobStatus
from app.models.ingestion_tracking import IngestionURL, IngestionChunk, URLStatus, ChunkStatus
from app.models.assistant import Assistant, AssistantStatus
from app.services.content_processor import ContentProcessor
from app.services.embeddings import EmbeddingService
from app.core.qdrant_client import store_embeddings, ensure_assistant_collection
from app.core.database import AsyncSessionLocal

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
                
                # Guard: Skip if job is already completed or if ingestion is already in progress
                if job.status == JobStatus.COMPLETED.value:
                    logger.warning(f"Job {job_id} is already completed, skipping duplicate ingestion")
                    return
                
                if job.current_stage in ["processing", "embedding", "ingestion", "storing"]:
                    logger.warning(f"Job {job_id} ingestion is already in progress (stage: {job.current_stage}), skipping duplicate")
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
                    # Create ScrapedPage object for processor
                    from app.services.web_scraper import ScrapedPage
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
                job.current_stage = "embedding"
                await db.commit()
                
                texts = [chunk.content for chunk in all_chunks]
                embeddings = await self.embedding_service.embed_texts(texts)
                
                logger.info(f"Job {job_id}: Generated {len(embeddings)} embeddings")
                
                # Ensure collection exists
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
                job.current_stage = "storing"
                await db.commit()
                
                for chunk, point_id in zip(all_chunks, point_ids):
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
                    await db.commit()
                    logger.info(f"Assistant {assistant_id} status updated to READY")
                
                logger.info(f"Job {job_id}: Ingestion completed successfully")
                
        except Exception as e:
            logger.error(f"Job {job_id}: Ingestion failed - {str(e)}", exc_info=True)
            
            # Update job status to failed
            try:
                async with AsyncSessionLocal() as db:
                    job = await db.get(IngestionJob, job_id)
                    job.status = JobStatus.FAILED.value
                    job.errors_count = 1
                    job.error_details = [{"error": str(e), "timestamp": datetime.utcnow().isoformat()}]
                    await db.commit()
            except Exception as db_error:
                logger.error(f"Failed to update job status: {str(db_error)}")