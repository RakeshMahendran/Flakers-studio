"""
Status Update Service
Handles status updates and lifecycle management for assistants and jobs
"""
import asyncio
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant, AssistantStatus
from app.models.content import IngestionJob

logger = logging.getLogger(__name__)

class StatusUpdateService:
    """
    Service to monitor and update assistant and job statuses
    
    This service:
    - Monitors job progress
    - Updates assistant status based on job completion
    - Handles error states and recovery
    - Provides status synchronization between systems
    """
    
    def __init__(self):
        pass
    
    async def monitor_assistant_jobs(self, assistant_id: str) -> bool:
        """
        Monitor all jobs for an assistant and update status accordingly
        
        Returns:
            bool: True if assistant is ready, False if still processing
        """
        try:
            async with AsyncSessionLocal() as db:
                # Get assistant
                assistant_result = await db.execute(
                    select(Assistant).where(Assistant.id == assistant_id)
                )
                assistant = assistant_result.scalar_one_or_none()
                
                if not assistant:
                    logger.error(f"Assistant {assistant_id} not found")
                    return False
                
                # Get recent ingestion jobs
                jobs_result = await db.execute(
                    select(IngestionJob)
                    .where(IngestionJob.assistant_id == assistant_id)
                    .order_by(IngestionJob.started_at.desc())
                    .limit(5)
                )
                jobs = jobs_result.scalars().all()
                
                if not jobs:
                    logger.info(f"No jobs found for assistant {assistant_id}")
                    return assistant.status == AssistantStatus.READY
                
                # Check job statuses
                completed_jobs = 0
                failed_jobs = 0
                running_jobs = 0
                total_chunks = 0
                total_pages = 0
                
                for job in jobs:
                    if job.status == "completed":
                        completed_jobs += 1
                        total_chunks += job.chunks_created or 0
                        total_pages += job.pages_processed or 0
                    elif job.status == "failed":
                        failed_jobs += 1
                    elif job.status in ["running", "scraping", "processing", "embedding", "indexing", "storing"]:
                        running_jobs += 1
                
                # Update assistant status based on job results
                if running_jobs > 0:
                    # Still processing
                    if assistant.status != AssistantStatus.INGESTING:
                        assistant.status = AssistantStatus.INGESTING
                        assistant.status_message = f"Processing content ({running_jobs} jobs running)"
                        await db.commit()
                    return False
                
                elif completed_jobs > 0 and failed_jobs == 0:
                    # All jobs completed successfully
                    assistant.status = AssistantStatus.READY
                    assistant.status_message = "Assistant is ready for chat"
                    assistant.total_chunks_indexed = str(total_chunks)
                    assistant.total_pages_crawled = str(total_pages)
                    
                    # Generate system prompt if not exists
                    if not assistant.system_prompt:
                        assistant.system_prompt = self._generate_system_prompt(assistant)
                    
                    await db.commit()
                    logger.info(f"Assistant {assistant_id} is now ready with {total_chunks} chunks")
                    return True
                
                elif failed_jobs > 0:
                    # Some jobs failed
                    if completed_jobs > 0:
                        # Partial success
                        assistant.status = AssistantStatus.READY
                        assistant.status_message = f"Ready with partial content ({failed_jobs} jobs failed)"
                        assistant.total_chunks_indexed = str(total_chunks)
                        assistant.total_pages_crawled = str(total_pages)
                    else:
                        # Complete failure
                        assistant.status = AssistantStatus.ERROR
                        assistant.status_message = f"Content ingestion failed ({failed_jobs} jobs failed)"
                    
                    await db.commit()
                    return assistant.status == AssistantStatus.READY
                
                else:
                    # No completed or failed jobs (shouldn't happen)
                    logger.warning(f"Unexpected job state for assistant {assistant_id}")
                    return False
                
        except Exception as e:
            logger.error(f"Error monitoring assistant jobs: {str(e)}")
            return False
    
    async def update_job_progress(self, job_id: str) -> Optional[dict]:
        """
        Update job progress and return current status
        
        Returns:
            dict: Job status information or None if not found
        """
        try:
            async with AsyncSessionLocal() as db:
                # Get job from database
                job = await db.get(IngestionJob, job_id)
                
                if not job:
                    return None

                urls_total = int(job.total_urls_discovered or 0)
                urls_processed = int(job.urls_processed or 0)
                urls_completed = int(job.urls_completed or 0)
                pages_processed = urls_processed + urls_completed

                total_chunks_created = int(job.total_chunks_created or 0)
                chunks_uploaded = int(job.chunks_uploaded or 0)

                if total_chunks_created > 0 and (job.current_stage in ["ingestion", "storing", "completed"]):
                    progress_percentage = int(round((chunks_uploaded / total_chunks_created) * 100))
                else:
                    progress_percentage = int(round((pages_processed / urls_total) * 100)) if urls_total > 0 else 0
                
                job_status = {
                    "job_id": str(job.id),
                    "assistant_id": str(job.assistant_id),
                    "status": job.status,
                    "progress_percentage": progress_percentage,
                    "pages_processed": pages_processed,
                    "current_stage": job.current_stage,
                    "urls_discovered": job.total_urls_discovered or 0,
                    "urls_scraped": job.urls_scraped or 0,
                    "chunks_created": job.total_chunks_created or 0,
                    "errors_count": int(job.errors_count or 0),
                    "started_at": job.started_at.isoformat() if job.started_at else None,
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None
                }
                
                # Update assistant status if job completed
                if job.status in ['completed', 'failed']:
                    await self.monitor_assistant_jobs(str(job.assistant_id))
                
                return job_status
            
        except Exception as e:
            logger.error(f"Error updating job progress: {str(e)}")
            return None
    
    async def sync_assistant_status(self, assistant_id: str) -> dict:
        """
        Synchronize assistant status with current job states
        
        Returns:
            dict: Current assistant status and job information
        """
        try:
            async with AsyncSessionLocal() as db:
                # Get assistant
                assistant_result = await db.execute(
                    select(Assistant).where(Assistant.id == assistant_id)
                )
                assistant = assistant_result.scalar_one_or_none()
                
                if not assistant:
                    return {"error": "Assistant not found"}
                
                # Monitor jobs and update status
                is_ready = await self.monitor_assistant_jobs(assistant_id)
                
                # Get updated assistant info
                await db.refresh(assistant)
                
                # Get recent jobs
                jobs_result = await db.execute(
                    select(IngestionJob)
                    .where(IngestionJob.assistant_id == assistant_id)
                    .order_by(IngestionJob.started_at.desc())
                    .limit(3)
                )
                recent_jobs = []
                for job in jobs_result.scalars():
                    recent_jobs.append({
                        "job_id": str(job.id),
                        "status": job.status,
                        "progress": job.progress_percentage,
                        "chunks_created": job.chunks_created,
                        "started_at": job.started_at.isoformat() if job.started_at else None
                    })
                
                return {
                    "assistant_id": assistant_id,
                    "status": assistant.status.value,
                    "status_message": assistant.status_message,
                    "is_ready": is_ready,
                    "total_chunks": assistant.total_chunks_indexed,
                    "total_pages": assistant.total_pages_crawled,
                    "recent_jobs": recent_jobs,
                    "last_updated": assistant.updated_at.isoformat() if assistant.updated_at else None
                }
                
        except Exception as e:
            logger.error(f"Error syncing assistant status: {str(e)}")
            return {"error": str(e)}
    
    async def cleanup_stale_jobs(self, max_age_hours: int = 24) -> int:
        """
        Clean up stale jobs that have been running too long
        
        Returns:
            int: Number of jobs cleaned up
        """
        try:
            from datetime import datetime, timedelta
            
            cutoff_time = datetime.utcnow() - timedelta(hours=max_age_hours)
            cleaned_count = 0
            
            async with AsyncSessionLocal() as db:
                # Find stale jobs
                stale_jobs_result = await db.execute(
                    select(IngestionJob)
                    .where(
                        IngestionJob.status.in_(["running", "scraping", "processing", "embedding", "indexing", "storing"])
                    )
                    .where(IngestionJob.started_at < cutoff_time)
                )
                
                stale_jobs = stale_jobs_result.scalars().all()
                
                for job in stale_jobs:
                    # Mark as failed
                    job.status = "failed"
                    job.error_details = job.error_details or []
                    job.error_details.append({
                        "error": "Job timed out - exceeded maximum runtime",
                        "timestamp": datetime.utcnow().isoformat(),
                        "cleanup_reason": "stale_job_cleanup"
                    })
                    job.completed_at = datetime.utcnow()
                    cleaned_count += 1
                    
                    logger.warning(f"Cleaned up stale job {job.id} for assistant {job.assistant_id}")
                
                await db.commit()
                
                # Update assistant statuses for affected assistants
                affected_assistants = set(str(job.assistant_id) for job in stale_jobs)
                for assistant_id in affected_assistants:
                    await self.monitor_assistant_jobs(assistant_id)
                
                return cleaned_count
                
        except Exception as e:
            logger.error(f"Error cleaning up stale jobs: {str(e)}")
            return 0
    
    async def restart_failed_job(self, job_id: str) -> Optional[str]:
        """
        Restart a failed ingestion job
        
        Returns:
            str: New job ID if successful, None if failed
        """
        try:
            async with AsyncSessionLocal() as db:
                # Get the failed job
                job_result = await db.execute(
                    select(IngestionJob).where(IngestionJob.id == job_id)
                )
                job = job_result.scalar_one_or_none()
                
                if not job:
                    logger.error(f"Job {job_id} not found")
                    return None
                
                if job.status != "failed":
                    logger.error(f"Job {job_id} is not in failed state")
                    return None
                
                # Get assistant
                assistant_result = await db.execute(
                    select(Assistant).where(Assistant.id == job.assistant_id)
                )
                assistant = assistant_result.scalar_one_or_none()
                
                if not assistant:
                    logger.error(f"Assistant {job.assistant_id} not found")
                    return None
                
                # Start new discovery job
                from app.services.content_discovery import ContentDiscoveryService
                discovery_service = ContentDiscoveryService()
                
                new_job_id = await discovery_service.start_discovery(
                    assistant_id=str(assistant.id),
                    project_id=str(job.project_id),
                    tenant_id=str(job.tenant_id),
                    site_url=assistant.site_url
                )
                
                # Update assistant status
                assistant.status = AssistantStatus.CREATING
                assistant.status_message = f"Restarting content discovery (retry of job {job_id})"
                await db.commit()
                
                logger.info(f"Restarted failed job {job_id} as new job {new_job_id}")
                return new_job_id
                
        except Exception as e:
            logger.error(f"Error restarting failed job: {str(e)}")
            return None
    
    def _generate_system_prompt(self, assistant: Assistant) -> str:
        """Generate system prompt for assistant"""
        template_prompts = {
            "support": f"You are a helpful support assistant for {assistant.name}. Help users with technical issues and provide documentation guidance.",
            "customer": f"You are a customer service assistant for {assistant.name}. Help customers with questions about products and services.",
            "sales": f"You are a sales assistant for {assistant.name}. Help potential customers understand products and pricing.",
            "ecommerce": f"You are an e-commerce assistant for {assistant.name}. Help customers find products and get support."
        }
        
        base_prompt = template_prompts.get(assistant.template.value, f"You are an AI assistant for {assistant.name}.")
        
        governance_addition = f"""

GOVERNANCE RULES:
- Only use information from the provided context
- Always cite sources using provided URLs
- Allowed content types: {', '.join(assistant.allowed_intents)}
- If a question is outside your scope, politely decline
- Maintain strict tenant isolation"""
        
        return base_prompt + governance_addition