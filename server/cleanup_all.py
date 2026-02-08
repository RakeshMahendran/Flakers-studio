"""
Complete cleanup: Delete all assistants and Qdrant collections
"""
import asyncio
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant
from app.models.content import IngestionJob, ContentChunk
from app.models.ingestion_tracking import IngestionURL, IngestionChunk
from app.core.qdrant_client import get_qdrant_client

async def cleanup_all():
    print("=" * 60)
    print("COMPLETE CLEANUP: Database + Vector DB")
    print("=" * 60)
    
    # 1. Delete from PostgreSQL database
    print("\n[1/2] Cleaning PostgreSQL database...")
    async with AsyncSessionLocal() as db:
        # Get counts before deletion
        result = await db.execute(select(Assistant))
        assistants = result.scalars().all()
        assistant_count = len(assistants)
        
        result = await db.execute(select(IngestionJob))
        jobs = result.scalars().all()
        job_count = len(jobs)
        
        result = await db.execute(select(ContentChunk))
        chunks = result.scalars().all()
        chunk_count = len(chunks)
        
        result = await db.execute(select(IngestionURL))
        urls = result.scalars().all()
        url_count = len(urls)
        
        print(f"\nFound in database:")
        print(f"  - {assistant_count} assistants")
        print(f"  - {job_count} ingestion jobs")
        print(f"  - {chunk_count} content chunks")
        print(f"  - {url_count} ingestion URLs")
        
        if assistant_count == 0 and job_count == 0:
            print("\n✓ Database is already clean!")
        else:
            print("\nDeleting from database...")
            
            # Delete in correct order (respecting foreign keys)
            result = await db.execute(delete(ContentChunk))
            print(f"  ✓ Deleted {result.rowcount} content chunks")
            
            result = await db.execute(delete(IngestionChunk))
            print(f"  ✓ Deleted {result.rowcount} ingestion chunks")
            
            result = await db.execute(delete(IngestionURL))
            print(f"  ✓ Deleted {result.rowcount} ingestion URLs")
            
            result = await db.execute(delete(IngestionJob))
            print(f"  ✓ Deleted {result.rowcount} ingestion jobs")
            
            result = await db.execute(delete(Assistant))
            print(f"  ✓ Deleted {result.rowcount} assistants")
            
            await db.commit()
            print("\n✓ Database cleanup complete!")
    
    # 2. Delete from Qdrant vector database
    print("\n[2/2] Cleaning Qdrant vector database...")
    try:
        client = get_qdrant_client()
        
        # Get all collections
        collections = client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if not collection_names:
            print("\n✓ No collections found in Qdrant!")
        else:
            print(f"\nFound {len(collection_names)} collections in Qdrant:")
            for name in collection_names:
                print(f"  - {name}")
            
            print("\nDeleting collections...")
            for name in collection_names:
                try:
                    client.delete_collection(collection_name=name)
                    print(f"  ✓ Deleted collection: {name}")
                except Exception as e:
                    print(f"  ✗ Failed to delete {name}: {str(e)}")
            
            print("\n✓ Qdrant cleanup complete!")
    
    except Exception as e:
        print(f"\n✗ Error accessing Qdrant: {str(e)}")
        print("  Make sure Qdrant is running and accessible")
    
    print("\n" + "=" * 60)
    print("✅ CLEANUP COMPLETE!")
    print("=" * 60)
    print("\nYou can now create new assistants from scratch.")
    print("Both the database and vector store are clean.\n")

if __name__ == "__main__":
    asyncio.run(cleanup_all())
