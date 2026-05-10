"""
Celery tasks for FlakersStudio ingestion pipeline.

This module defines asynchronous tasks that replace the polling-based worker.
Tasks cooperatively check for cancellation using the existing DB flags.
"""
import logging
import asyncio
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select

from backend.queue.celery_app import celery_app
from backend.config.database import AsyncSessionLocal
from backend.models.content import IngestionJob, JobStatus
from backend.models.assistant import Assistant
from backend.models.project import Project
from backend.ingestion.ingestion import IngestionService
from backend.ingestion.cancellation import CancellationException

logger = logging.getLogger(__name__)


class AsyncTask(Task):
    """Base task that properly handles async functions."""

    def __call__(self, *args, **kwargs):
        """Execute async task in event loop."""
        return asyncio.run(self.run_async(*args, **kwargs))

    async def run_async(self, *args, **kwargs):
        """Override in subclass to implement async logic."""
        raise NotImplementedError


@celery_app.task(bind=True, base=AsyncTask, name="ingestion.run_job", max_retries=0)
async def run_ingestion_job(self, job_id: str) -> dict:
    """
    Execute ingestion job asynchronously via Celery.

    This task wraps the existing IngestionService._process_ingestion method.
    It checks for cancellation cooperatively via DB flags.

    Args:
        job_id: UUID of the IngestionJob to process

    Returns:
        dict: Status information about completed job

    Raises:
        CancellationException: If job is cancelled during execution
        Exception: If job fails
    """
    try:
        logger.info(f"[Celery] Starting ingestion job {job_id} (task_id={self.request.id})")

        # Fetch job details from database
        async with AsyncSessionLocal() as db:
            job = await db.get(IngestionJob, job_id)
            if not job:
                error_msg = f"Job {job_id} not found"
                logger.error(f"[Celery] {error_msg}")
                return {"status": "error", "error": error_msg}

            # Check if job should be skipped
            if job.status == JobStatus.COMPLETED.value:
                logger.warning(f"[Celery] Job {job_id} already completed, skipping")
                return {"status": "skipped", "reason": "already_completed"}

            if job.should_cancel():
                logger.warning(f"[Celery] Job {job_id} cancelled before processing")
                return {"status": "cancelled", "reason": "cancelled_before_start"}

            # Ensure job is at discovery_complete stage
            if job.current_stage != "discovery_complete":
                error_msg = f"Job {job_id} not ready for ingestion (stage: {job.current_stage})"
                logger.error(f"[Celery] {error_msg}")
                return {"status": "error", "error": error_msg}

            # Get assistant and project details
            assistant = await db.get(Assistant, job.assistant_id)
            project = await db.get(Project, job.project_id)

            if not assistant:
                error_msg = f"Assistant {job.assistant_id} not found for job {job_id}"
                logger.error(f"[Celery] {error_msg}")
                return {"status": "error", "error": error_msg}

            assistant_name = project.name if project and project.name else assistant.name
            user_name = str(job.tenant_id)[:8]

        # Execute ingestion
        service = IngestionService()
        await service._process_ingestion(job_id, str(assistant.id), assistant_name, user_name)

        logger.info(f"[Celery] Successfully completed ingestion job {job_id}")
        return {
            "status": "completed",
            "job_id": job_id,
            "assistant_id": str(assistant.id),
        }

    except CancellationException as e:
        logger.info(f"[Celery] Job {job_id} cancelled: {str(e)}")
        return {
            "status": "cancelled",
            "job_id": job_id,
            "reason": str(e)
        }

    except SoftTimeLimitExceeded:
        error_msg = f"Job {job_id} exceeded time limit"
        logger.error(f"[Celery] {error_msg}")

        # Mark job as failed
        try:
            async with AsyncSessionLocal() as db:
                service = IngestionService()
                await service._mark_job_failed(db, job_id, "Task exceeded time limit (25 minutes)")
        except Exception as mark_error:
            logger.error(f"[Celery] Failed to mark job as failed: {str(mark_error)}")

        return {
            "status": "failed",
            "job_id": job_id,
            "error": error_msg
        }

    except Exception as e:
        error_msg = f"Job {job_id} failed: {str(e)}"
        logger.error(f"[Celery] {error_msg}", exc_info=True)

        # The IngestionService already handles marking failed jobs,
        # but we'll return error status for Celery tracking
        return {
            "status": "failed",
            "job_id": job_id,
            "error": str(e)
        }


@celery_app.task(name="ingestion.cancel_job", max_retries=0)
def cancel_ingestion_job(job_id: str) -> dict:
    """
    Request cancellation of an ingestion job.

    This task sets the cancellation flag in the database.
    The running task checks this flag cooperatively and stops.

    Args:
        job_id: UUID of the IngestionJob to cancel

    Returns:
        dict: Status information about cancellation request
    """
    try:
        logger.info(f"[Celery] Cancellation requested for job {job_id}")

        async def _cancel():
            from backend.ingestion.cancellation import request_job_cancellation

            async with AsyncSessionLocal() as db:
                result = await request_job_cancellation(
                    db,
                    job_id,
                    reason="User requested cancellation via Celery"
                )
                return result

        result = asyncio.run(_cancel())

        if result:
            logger.info(f"[Celery] Successfully requested cancellation for job {job_id}")
            return {"status": "cancelled", "job_id": job_id}
        else:
            logger.warning(f"[Celery] Could not cancel job {job_id} (already completed or not found)")
            return {"status": "not_cancelled", "job_id": job_id, "reason": "job_not_found_or_completed"}

    except Exception as e:
        error_msg = f"Failed to cancel job {job_id}: {str(e)}"
        logger.error(f"[Celery] {error_msg}", exc_info=True)
        return {"status": "error", "job_id": job_id, "error": str(e)}
