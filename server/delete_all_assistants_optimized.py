"""
Delete all assistants and related data - Memory Optimized
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
        
        # Get count before deletion (using count() instead of loading all records)
        from sqlalchemy import func
        
        assistant_count = await db.scalar(select(func.count()).select_from(Assistant))
        job_count = await db.scalar(select(func.count()).select_from(IngestionJob))
        
        print(f"\nFound:")
        print(f"  - {assistant_count} assistants")
        print(f"  - {job_count} ingestion jobs")
        
        # Delete in correct order (respecting foreign keys)
        print("\nDeleting data...")
        
        # 1. Delete content chunks
        result = await db.execute(delete(ContentChunk))
        print(f"  ✓ Deleted {result.rowcount} content chunks")
        await db.commit()  # Commit after each delete to free memory
        
        # 2. Delete ingestion chunks
        result = await db.execute(delete(IngestionChunk))
        print(f"  ✓ Deleted {result.rowcount} ingestion chunks")
        await db.commit()
        
        # 3. Delete ingestion URLs
        result = await db.execute(delete(IngestionURL))
        print(f"  ✓ Deleted {result.rowcount} ingestion URLs")
        await db.commit()
        
        # 4. Delete ingestion jobs
        result = await db.execute(delete(IngestionJob))
        print(f"  ✓ Deleted {result.rowcount} ingestion jobs")
        await db.commit()
        
        # 5. Delete assistants
        result = await db.execute(delete(Assistant))
        print(f"  ✓ Deleted {result.rowcount} assistants")
        await db.commit()
        
        print("\n✅ All assistants and related data deleted successfully!")
        print("\nYou can now create a new assistant from scratch.")

if __name__ == "__main__":
    asyncio.run(delete_all())
