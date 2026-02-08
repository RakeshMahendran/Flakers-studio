"""
Progress Reporting Service
Provides truthful, state-based progress reporting
Never fabricates completion percentages or totals
"""
import logging
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.content import IngestionJob
from app.models.ingestion_tracking import IngestionURL, IngestionChunk, URLStatus, ChunkStatus

logger = logging.getLogger(__name__)

class ProgressReporter:
    """
    Truthful progress reporter
    
    Rules:
    - Never guess totals
    - Never estimate completion
    - Report actual state-based counts
    - Only show percentages when totals are known
    """
    
    @staticmethod
    async def get_job_progress(db: AsyncSession, job_id: str) -> Dict[str, Any]:
        """
        Get truthful job progress
        
        Returns:
            Progress report with actual counts and status
        """
        # Get job
        job_result = await db.execute(
            select(IngestionJob).where(IngestionJob.id == job_id)
        )
        job = job_result.scalar_one_or_none()
        
        if not job:
            return {"error": "Job not found"}
        
        # Get URL counts by status
        url_counts_result = await db.execute(
            select(
                IngestionURL.status,
                func.count(IngestionURL.id)
            )
            .where(IngestionURL.job_id == job_id)
            .group_by(IngestionURL.status)
        )
        url_counts = {row[0]: row[1] for row in url_counts_result.all()}
        
        # Get chunk counts by status (if chunks exist)
        chunk_counts_result = await db.execute(
            select(
                IngestionChunk.status,
                func.count(IngestionChunk.id)
            )
            .where(IngestionChunk.job_id == job_id)
            .group_by(IngestionChunk.status)
        )
        chunk_counts = {row[0]: row[1] for row in chunk_counts_result.all()}
        
        # Build progress report
        progress = {
            "job_id": str(job.id),
            "status": job.status,
            "current_stage": job.current_stage,
            
            # Discovery phase (completed first)
            "discovery": {
                "total_urls_discovered": job.total_urls_discovered,
                "is_complete": job.total_urls_discovered > 0
            },
            
            # URL-level progress
            "urls": {
                "total": job.total_urls_discovered,
                "discovered": url_counts.get(URLStatus.DISCOVERED.value, 0),
                "scraping": url_counts.get(URLStatus.SCRAPING.value, 0),
                "scraped": url_counts.get(URLStatus.SCRAPED.value, 0),
                "failed_scraping": url_counts.get(URLStatus.FAILED_SCRAPING.value, 0),
                "processing": url_counts.get(URLStatus.PROCESSING.value, 0),
                "processed": url_counts.get(URLStatus.PROCESSED.value, 0),
                "failed_processing": url_counts.get(URLStatus.FAILED_PROCESSING.value, 0),
                "completed": url_counts.get(URLStatus.COMPLETED.value, 0),
                "partial": url_counts.get(URLStatus.PARTIAL.value, 0),
                "failed": url_counts.get(URLStatus.FAILED.value, 0)
            },
            
            # Chunk-level progress
            "chunks": ProgressReporter._get_chunk_progress(job, chunk_counts),
            
            # Timestamps
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "cancelled_at": job.cancelled_at.isoformat() if job.cancelled_at else None,
            
            # Errors
            "errors_count": job.errors_count,
            "error_details": job.error_details or [],
            
            # Cancellation
            "cancellation_requested": job.cancellation_requested,
            "cancellation_reason": job.cancellation_reason
        }
        
        return progress
    
    @staticmethod
    def _get_chunk_progress(job: IngestionJob, chunk_counts: Dict[str, int]) -> Dict[str, Any]:
        """
        Get chunk-level progress
        Only shows percentages when total is known
        """
        total_chunks = job.total_chunks_created
        
        if total_chunks is None:
            # Total not yet known - processing still in progress
            return {
                "status": "in_progress",
                "message": "Processing URLs - final chunk count pending",
                "queued": chunk_counts.get(ChunkStatus.QUEUED.value, 0),
                "uploading": chunk_counts.get(ChunkStatus.UPLOADING.value, 0),
                "uploaded": chunk_counts.get(ChunkStatus.UPLOADED.value, 0),
                "failed": chunk_counts.get(ChunkStatus.FAILED.value, 0),
                "retrying": chunk_counts.get(ChunkStatus.RETRYING.value, 0)
            }
        
        # Total is known - can show percentages
        uploaded = chunk_counts.get(ChunkStatus.UPLOADED.value, 0)
        failed = chunk_counts.get(ChunkStatus.FAILED.value, 0)
        queued = chunk_counts.get(ChunkStatus.QUEUED.value, 0)
        uploading = chunk_counts.get(ChunkStatus.UPLOADING.value, 0)
        retrying = chunk_counts.get(ChunkStatus.RETRYING.value, 0)
        
        completed_count = uploaded + failed  # Both are "done" (success or failure)
        
        return {
            "status": "known",
            "total": total_chunks,
            "queued": queued,
            "uploading": uploading,
            "uploaded": uploaded,
            "failed": failed,
            "retrying": retrying,
            "completed_count": completed_count,
            "percentage_complete": round((completed_count / total_chunks * 100), 2) if total_chunks > 0 else 0,
            "percentage_uploaded": round((uploaded / total_chunks * 100), 2) if total_chunks > 0 else 0
        }
    
    @staticmethod
    async def get_url_details(db: AsyncSession, job_id: str) -> List[Dict[str, Any]]:
        """Get detailed status for all URLs in a job"""
        result = await db.execute(
            select(IngestionURL)
            .where(IngestionURL.job_id == job_id)
            .order_by(IngestionURL.created_at)
        )
        urls = result.scalars().all()
        
        url_details = []
        for url in urls:
            # Get chunk counts for this URL
            chunk_result = await db.execute(
                select(
                    IngestionChunk.status,
                    func.count(IngestionChunk.id)
                )
                .where(IngestionChunk.url_id == url.id)
                .group_by(IngestionChunk.status)
            )
            chunk_counts = {row[0]: row[1] for row in chunk_result.all()}
            
            url_details.append({
                "url": url.url,
                "status": url.status,
                "title": url.title,
                "content_type": url.content_type,
                "content_length": url.content_length,
                "chunk_count": url.chunk_count,
                "chunks_uploaded": chunk_counts.get(ChunkStatus.UPLOADED.value, 0),
                "chunks_failed": chunk_counts.get(ChunkStatus.FAILED.value, 0),
                "failure_reason": url.failure_reason,
                "scraped_at": url.scraped_at.isoformat() if url.scraped_at else None,
                "processed_at": url.processed_at.isoformat() if url.processed_at else None
            })
        
        return url_details
    
    @staticmethod
    async def get_failed_chunks(db: AsyncSession, job_id: str) -> List[Dict[str, Any]]:
        """Get all failed chunks for retry"""
        result = await db.execute(
            select(IngestionChunk)
            .where(
                IngestionChunk.job_id == job_id,
                IngestionChunk.status == ChunkStatus.FAILED.value
            )
        )
        chunks = result.scalars().all()
        
        failed_chunks = []
        for chunk in chunks:
            failed_chunks.append({
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "content_preview": chunk.content[:100] + "..." if len(chunk.content) > 100 else chunk.content,
                "failure_reason": chunk.failure_reason,
                "retry_count": chunk.retry_count,
                "last_retry_at": chunk.last_retry_at.isoformat() if chunk.last_retry_at else None
            })
        
        return failed_chunks
    
    @staticmethod
    def format_progress_message(progress: Dict[str, Any]) -> str:
        """Format progress into human-readable message"""
        if progress.get("error"):
            return progress["error"]
        
        status = progress["status"]
        stage = progress["current_stage"]
        
        if status == "completed":
            urls = progress["urls"]
            chunks = progress["chunks"]
            return (
                f"Completed: {urls['completed']} URLs processed, "
                f"{chunks.get('uploaded', 0)} chunks uploaded"
            )
        
        if status == "cancelled":
            return f"Cancelled: {progress.get('cancellation_reason', 'User requested')}"
        
        if status == "failed":
            return f"Failed: {progress['errors_count']} errors"
        
        # In progress
        urls = progress["urls"]
        chunks = progress["chunks"]
        
        if stage == "discovery":
            return f"Discovering URLs from website..."
        
        if stage == "scraping":
            total = urls["total"]
            scraped = urls["scraped"]
            return f"Scraping: {scraped}/{total} URLs"
        
        if stage == "processing":
            total = urls["total"]
            processed = urls["processed"]
            return f"Processing: {processed}/{total} URLs"
        
        if stage == "ingestion":
            if chunks["status"] == "in_progress":
                return chunks["message"]
            else:
                pct = chunks["percentage_complete"]
                return f"Uploading: {pct}% complete ({chunks['uploaded']}/{chunks['total']} chunks)"
        
        return f"Status: {status} - {stage}"
