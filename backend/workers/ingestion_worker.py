"""
Standalone ingestion worker entrypoint.

This worker has two modes:
1. Celery mode (USE_CELERY=True): Enqueues discovered jobs to Celery
2. Legacy polling mode (USE_CELERY=False): Processes jobs inline (old behavior)

The legacy mode is kept as a safety fallback for one release cycle.
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import select

from backend.config.database import AsyncSessionLocal
from backend.config.settings import settings
from backend.models.assistant import Assistant
from backend.models.content import IngestionJob, JobStatus
from backend.models.project import Project
from backend.ingestion.ingestion import IngestionService


logger = logging.getLogger(__name__)


async def run_worker_celery(poll_interval: float = 5.0):
    """
    Celery mode: Poll for discovery_complete jobs and enqueue them to Celery.

    This replaces inline processing with task queue dispatch.
    """
    from backend.queue.tasks import run_ingestion_job

    logger.info("[Celery Mode] Starting ingestion worker - will enqueue jobs to Celery")

    while True:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(IngestionJob)
                .where(
                    IngestionJob.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value]),
                    IngestionJob.current_stage == "discovery_complete",
                )
                .order_by(IngestionJob.started_at.asc())
                .limit(10)  # Batch enqueue up to 10 jobs
            )
            jobs = result.scalars().all()

            if not jobs:
                await asyncio.sleep(poll_interval)
                continue

            # Enqueue each job to Celery
            for job in jobs:
                try:
                    # Enqueue to Celery FIRST (before DB update to avoid lost jobs)
                    task = run_ingestion_job.delay(str(job.id))

                    # Mark as queued only after successful enqueue
                    job.current_stage = "queued_to_celery"
                    await db.commit()

                    logger.info(
                        f"[Celery Mode] Enqueued job {job.id} to Celery (task_id={task.id})"
                    )

                except Exception as e:
                    logger.error(f"[Celery Mode] Failed to enqueue job {job.id}: {str(e)}")
                    await db.rollback()  # Rollback to keep stage as discovery_complete
                    # Job will be retried on next poll

        await asyncio.sleep(poll_interval)


async def run_worker_legacy(poll_interval: float = 5.0):
    """
    Legacy polling mode: Process jobs inline (old behavior).

    This is kept as a safety fallback for one release cycle.
    """
    service = IngestionService()

    logger.warning("[Legacy Mode] Running in legacy polling mode - consider enabling USE_CELERY")

    while True:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(IngestionJob)
                .where(
                    IngestionJob.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value]),
                    IngestionJob.current_stage == "discovery_complete",
                )
                .order_by(IngestionJob.started_at.asc())
                .limit(1)
            )
            job = result.scalar_one_or_none()

            if job is None:
                await asyncio.sleep(poll_interval)
                continue

            assistant = await db.get(Assistant, job.assistant_id)
            project = await db.get(Project, job.project_id)
            if assistant is None:
                logger.warning("Skipping ingestion job %s because assistant was not found", job.id)
                await asyncio.sleep(poll_interval)
                continue

            assistant_name = project.name if project and project.name else assistant.name
            user_name = str(job.tenant_id)[:8]
            await service._process_ingestion(str(job.id), str(assistant.id), assistant_name, user_name)

        await asyncio.sleep(poll_interval)


def main():
    parser = argparse.ArgumentParser(description="Run the Flakers Studio ingestion worker.")
    parser.add_argument("--poll-interval", type=float, default=5.0)
    parser.add_argument("--legacy", action="store_true", help="Force legacy polling mode (ignore USE_CELERY)")
    args = parser.parse_args()

    # Choose worker mode based on settings or CLI flag
    use_celery = settings.USE_CELERY and not args.legacy

    if use_celery:
        logger.info("Starting ingestion worker in Celery mode")
        asyncio.run(run_worker_celery(args.poll_interval))
    else:
        logger.info("Starting ingestion worker in legacy mode")
        asyncio.run(run_worker_legacy(args.poll_interval))


if __name__ == "__main__":
    main()
