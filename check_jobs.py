import asyncio
import sys
sys.path.insert(0, 'E:\\FlakersStudio')

from backend.config.database import AsyncSessionLocal
from sqlalchemy import select
from backend.models.content import IngestionJob

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(IngestionJob).order_by(IngestionJob.started_at.desc()).limit(3))
        jobs = result.scalars().all()
        for j in jobs:
            print(f'Job {j.id}:')
            print(f'  Status: {j.status}')
            print(f'  Stage: {j.current_stage}')
            print(f'  URLs discovered: {j.total_urls_discovered}')
            print(f'  URLs scraped: {j.urls_scraped}')
            print(f'  Errors: {j.errors_count}')
            if j.error_details:
                print(f'  Error details: {j.error_details[:200]}')
            print()

asyncio.run(check())
