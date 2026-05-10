"""
One-time migration script to enqueue existing pending jobs to Celery.

This script should be run once during the first deployment of the Celery-based
ingestion system. It finds all in-flight jobs (queued or running) that are at
the discovery_complete stage and enqueues them to Celery.

Usage:
    python scripts/migrate_pending_jobs.py [--dry-run]
"""
import asyncio
import argparse
import logging
from sqlalchemy import select

from backend.config.database import AsyncSessionLocal
from backend.models.content import IngestionJob, JobStatus
from backend.queue.tasks import run_ingestion_job

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def migrate_pending_jobs(dry_run: bool = False):
    """
    Find and enqueue all pending ingestion jobs to Celery.

    Args:
        dry_run: If True, only log what would be done without actually enqueuing
    """
    logger.info("Starting migration of pending jobs to Celery")

    async with AsyncSessionLocal() as db:
        # Find all jobs that are ready for ingestion
        result = await db.execute(
            select(IngestionJob)
            .where(
                IngestionJob.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value]),
                IngestionJob.current_stage == "discovery_complete",
            )
            .order_by(IngestionJob.started_at.asc())
        )
        jobs = result.scalars().all()

        if not jobs:
            logger.info("No pending jobs found to migrate")
            return 0

        logger.info(f"Found {len(jobs)} pending jobs to migrate")

        enqueued_count = 0
        failed_count = 0

        for job in jobs:
            try:
                job_id = str(job.id)
                assistant_id = str(job.assistant_id)
                tenant_id = str(job.tenant_id)

                if dry_run:
                    logger.info(
                        f"[DRY RUN] Would enqueue job {job_id} "
                        f"(assistant={assistant_id}, tenant={tenant_id[:8]})"
                    )
                    enqueued_count += 1
                else:
                    # Mark as queued to prevent duplicate enqueueing
                    job.current_stage = "queued_to_celery"
                    await db.commit()

                    # Enqueue to Celery
                    task = run_ingestion_job.delay(job_id)
                    logger.info(
                        f"Enqueued job {job_id} to Celery (task_id={task.id}, "
                        f"assistant={assistant_id}, tenant={tenant_id[:8]})"
                    )
                    enqueued_count += 1

            except Exception as e:
                logger.error(f"Failed to enqueue job {job.id}: {str(e)}")
                failed_count += 1

                if not dry_run:
                    # Reset stage so it can be retried
                    job.current_stage = "discovery_complete"
                    await db.commit()

        logger.info(
            f"Migration complete: {enqueued_count} jobs enqueued, {failed_count} failed"
        )

        return enqueued_count


def main():
    parser = argparse.ArgumentParser(
        description="Migrate pending ingestion jobs to Celery queue"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without actually enqueuing jobs"
    )
    args = parser.parse_args()

    if args.dry_run:
        logger.info("Running in DRY RUN mode - no changes will be made")

    count = asyncio.run(migrate_pending_jobs(dry_run=args.dry_run))

    if args.dry_run:
        logger.info(f"DRY RUN: Would have enqueued {count} jobs")
    else:
        logger.info(f"Successfully enqueued {count} jobs to Celery")


if __name__ == "__main__":
    main()
