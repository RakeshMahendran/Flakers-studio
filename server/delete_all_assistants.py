"""
Delete all assistants and related data
"""
import asyncio
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant
from app.models.content import IngestionJob, ContentChunk
from app.models.ingestion_tracking import IngestionURL, IngestionChunk

async def delete_all():
    async with AsyncSessionLocal() as db:
        print("Starting deletion of all assistants and related data...")
        
        # Get count before deletion
        result = await db.execute(select(Assistant))
        assistants = result.scalars().all()
        assistant_count = len(assistants)
        
        result = await db.execute(select(IngestionJob))
        jobs = result.scalars().all()
        job_count = len(jobs)
        
        print(f"\nFound:")
        print(f"  - {assistant_count} assistants")
        print(f"  - {job_count} ingestion jobs")
        
        # Delete in correct order (respecting foreign keys)
        print("\nDeleting data...")
        
        # 1. Delete content chunks
        result = await db.execute(delete(ContentChunk))
        print(f"  ✓ Deleted {result.rowcount} content chunks")
        
        # 2. Delete ingestion chunks
        result = await db.execute(delete(IngestionChunk))
        print(f"  ✓ Deleted {result.rowcount} ingestion chunks")
        
        # 3. Delete ingestion URLs
        result = await db.execute(delete(IngestionURL))
        print(f"  ✓ Deleted {result.rowcount} ingestion URLs")
        
        # 4. Delete ingestion jobs
        result = await db.execute(delete(IngestionJob))
        print(f"  ✓ Deleted {result.rowcount} ingestion jobs")
        
        # 5. Delete assistants
        result = await db.execute(delete(Assistant))
        print(f"  ✓ Deleted {result.rowcount} assistants")
        
        await db.commit()
        
        print("\n✅ All assistants and related data deleted successfully!")
        print("\nYou can now create a new assistant from scratch.")

if __name__ == "__main__":
    asyncio.run(delete_all())
