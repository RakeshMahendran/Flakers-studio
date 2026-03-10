"""
Standalone ingestion worker entrypoint.
"""
from __future__ import annotations

import argparse
import asyncio
import logging

from sqlalchemy import select

from backend.config.database import AsyncSessionLocal
from backend.models.assistant import Assistant
from backend.models.content import IngestionJob, JobStatus
from backend.models.project import Project
from backend.ingestion.ingestion import IngestionService


logger = logging.getLogger(__name__)


async def run_worker(poll_interval: float = 5.0):
    service = IngestionService()

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
    args = parser.parse_args()
    asyncio.run(run_worker(args.poll_interval))


if __name__ == "__main__":
    main()
