"""
Manually trigger ingestion for assistants with completed discovery jobs
"""
import asyncio
import sys
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant, AssistantStatus
from app.models.content import IngestionJob
from app.services.ingestion import IngestionService

async def trigger_ingestion_for_assistant(assistant_id: str):
    """Trigger ingestion for a specific assistant"""
    async with AsyncSessionLocal() as db:
        # Get assistant
        assistant_result = await db.execute(
            select(Assistant).where(Assistant.id == assistant_id)
        )
        assistant = assistant_result.scalar_one_or_none()
        
        if not assistant:
            print(f"❌ Assistant {assistant_id} not found")
            return False
        
        print(f"\n{'='*80}")
        print(f"Assistant: {assistant.name}")
        print(f"ID: {assistant.id}")
        print(f"Current Status: {assistant.status.value}")
        
        # Get the most recent completed discovery job
        jobs_result = await db.execute(
            select(IngestionJob)
            .where(IngestionJob.assistant_id == assistant_id)
            .where(IngestionJob.status == "completed")
            .order_by(IngestionJob.started_at.desc())
            .limit(1)
        )
        discovery_job = jobs_result.scalar_one_or_none()
        
        if not discovery_job:
            print(f"❌ No completed discovery job found for this assistant")
            return False
        
        print(f"\nDiscovery Job ID: {discovery_job.id}")
        print(f"URLs Discovered: {discovery_job.total_urls_discovered}")
        print(f"URLs Scraped: {discovery_job.urls_scraped}")
        
        # Update assistant status
        assistant.status = AssistantStatus.INGESTING
        assistant.status_message = "Ingesting content into vector database"
        await db.commit()
        
        print(f"\n✅ Updated assistant status to INGESTING")
        print(f"🚀 Starting ingestion process...")
        
        # Start ingestion
        ingestion_service = IngestionService()
        user_name = "default_user"  # You can customize this
        
        await ingestion_service.start_ingestion(
            job_id=str(discovery_job.id),
            assistant_id=assistant_id,
            assistant_name=assistant.name,
            user_name=user_name
        )
        
        print(f"✅ Ingestion started successfully!")
        print(f"\nThe ingestion process is running in the background.")
        print(f"It will:")
        print(f"  1. Process scraped content into chunks")
        print(f"  2. Generate embeddings")
        print(f"  3. Upload to Qdrant vector database")
        print(f"  4. Update assistant status to READY")
        print(f"\nCheck the backend logs for progress.")
        
        return True

async def trigger_all_pending():
    """Trigger ingestion for all assistants with completed discovery but not ready"""
    async with AsyncSessionLocal() as db:
        # Find assistants that are stuck in 'creating' status with completed jobs
        assistants_result = await db.execute(
            select(Assistant).where(
                Assistant.status.in_([AssistantStatus.CREATING, AssistantStatus.INGESTING])
            )
        )
        assistants = assistants_result.scalars().all()
        
        print(f"Found {len(assistants)} assistants in CREATING/INGESTING status")
        
        triggered = 0
        for assistant in assistants:
            # Check if there's a completed discovery job
            jobs_result = await db.execute(
                select(IngestionJob)
                .where(IngestionJob.assistant_id == str(assistant.id))
                .where(IngestionJob.status == "completed")
                .order_by(IngestionJob.started_at.desc())
                .limit(1)
            )
            discovery_job = jobs_result.scalar_one_or_none()
            
            if discovery_job:
                print(f"\n📋 Triggering ingestion for: {assistant.name}")
                success = await trigger_ingestion_for_assistant(str(assistant.id))
                if success:
                    triggered += 1
                    # Wait a bit between triggers to avoid overwhelming the system
                    await asyncio.sleep(2)
        
        print(f"\n{'='*80}")
        print(f"✅ Triggered ingestion for {triggered} assistant(s)")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "--all":
            print("Triggering ingestion for all pending assistants...")
            asyncio.run(trigger_all_pending())
        else:
            assistant_id = sys.argv[1]
            asyncio.run(trigger_ingestion_for_assistant(assistant_id))
    else:
        print("Usage:")
        print("  python trigger_ingestion.py <assistant_id>  - Trigger for specific assistant")
        print("  python trigger_ingestion.py --all           - Trigger for all pending assistants")
        print("\nExample:")
        print("  python trigger_ingestion.py c7a71b76-f212-441e-80b5-58426225dd4f")
        print("  python trigger_ingestion.py --all")
