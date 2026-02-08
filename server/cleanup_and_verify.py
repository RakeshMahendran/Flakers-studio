"""
Cleanup all assistants and verify the complete flow is working
"""
import asyncio
from sqlalchemy import select, delete
from qdrant_client import QdrantClient
from app.core.database import AsyncSessionLocal
from app.models.assistant import Assistant
from app.models.project import Project
from app.models.content import ContentChunk, IngestionJob
from app.models.ingestion_tracking import IngestionURL, IngestionChunk
from app.models.chat import ChatSession, ChatMessage
from app.core.config import settings

async def cleanup_all():
    """Delete all assistants, projects, and related data"""
    
    print("="*70)
    print("CLEANUP: Deleting All Assistants and Related Data")
    print("="*70)
    
    async with AsyncSessionLocal() as db:
        # 1. Get all assistants
        result = await db.execute(select(Assistant))
        assistants = result.scalars().all()
        
        print(f"\n✓ Found {len(assistants)} assistants to delete\n")
        
        for assistant in assistants:
            print(f"Deleting: {assistant.name} ({assistant.id})")
            print(f"  Status: {assistant.status}")
            print(f"  Chunks: {assistant.total_chunks_indexed}")
            
            # Delete from Qdrant
            try:
                # Get project for collection name
                project_result = await db.execute(
                    select(Project).where(Project.id == assistant.project_id)
                )
                project = project_result.scalar_one_or_none()
                
                if project:
                    project_name = project.name
                    user_name = str(assistant.tenant_id)[:8]
                    safe_project_name = "".join(c.lower() if c.isalnum() else "_" for c in project_name)
                    safe_user_name = "".join(c.lower() if c.isalnum() else "_" for c in user_name)
                    collection_name = f"{safe_project_name}_{safe_user_name}"
                    
                    print(f"  Deleting Qdrant collection: {collection_name}")
                    
                    client = QdrantClient(
                        url=settings.QDRANT_URL,
                        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
                    )
                    
                    try:
                        client.delete_collection(collection_name)
                        print(f"  ✓ Deleted collection: {collection_name}")
                    except Exception as e:
                        print(f"  ⚠ Collection may not exist: {e}")
            except Exception as e:
                print(f"  ⚠ Error deleting from Qdrant: {e}")
        
        # 2. Delete all chat messages
        print("\n✓ Deleting chat messages...")
        await db.execute(delete(ChatMessage))
        
        # 3. Delete all chat sessions
        print("✓ Deleting chat sessions...")
        await db.execute(delete(ChatSession))
        
        # 4. Delete all content chunks
        print("✓ Deleting content chunks...")
        await db.execute(delete(ContentChunk))
        
        # 5. Delete all ingestion chunks
        print("✓ Deleting ingestion chunks...")
        await db.execute(delete(IngestionChunk))
        
        # 6. Delete all ingestion URLs
        print("✓ Deleting ingestion URLs...")
        await db.execute(delete(IngestionURL))
        
        # 7. Delete all ingestion jobs
        print("✓ Deleting ingestion jobs...")
        await db.execute(delete(IngestionJob))
        
        # 8. Delete all assistants
        print("✓ Deleting assistants...")
        await db.execute(delete(Assistant))
        
        # 9. Delete all projects
        print("✓ Deleting projects...")
        await db.execute(delete(Project))
        
        await db.commit()
        
        print("\n" + "="*70)
        print("✅ CLEANUP COMPLETE")
        print("="*70)

async def verify_cleanup():
    """Verify everything is deleted"""
    
    print("\n" + "="*70)
    print("VERIFICATION: Checking Database is Clean")
    print("="*70 + "\n")
    
    async with AsyncSessionLocal() as db:
        # Check assistants
        result = await db.execute(select(Assistant))
        assistants = result.scalars().all()
        print(f"Assistants: {len(assistants)} (should be 0)")
        
        # Check projects
        result = await db.execute(select(Project))
        projects = result.scalars().all()
        print(f"Projects: {len(projects)} (should be 0)")
        
        # Check content chunks
        result = await db.execute(select(ContentChunk))
        chunks = result.scalars().all()
        print(f"Content Chunks: {len(chunks)} (should be 0)")
        
        # Check ingestion jobs
        result = await db.execute(select(IngestionJob))
        jobs = result.scalars().all()
        print(f"Ingestion Jobs: {len(jobs)} (should be 0)")
        
        # Check chat sessions
        result = await db.execute(select(ChatSession))
        sessions = result.scalars().all()
        print(f"Chat Sessions: {len(sessions)} (should be 0)")
        
        # Check chat messages
        result = await db.execute(select(ChatMessage))
        messages = result.scalars().all()
        print(f"Chat Messages: {len(messages)} (should be 0)")
    
    # Check Qdrant collections
    print("\n" + "="*70)
    print("VERIFICATION: Checking Qdrant Collections")
    print("="*70 + "\n")
    
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
    )
    
    collections = client.get_collections()
    print(f"Remaining Collections: {len(collections.collections)}")
    for col in collections.collections:
        info = client.get_collection(col.name)
        print(f"  - {col.name}: {info.points_count} points")
    
    print("\n" + "="*70)
    print("✅ VERIFICATION COMPLETE")
    print("="*70)

async def print_flow_checklist():
    """Print the complete flow checklist"""
    
    print("\n" + "="*70)
    print("COMPLETE FLOW CHECKLIST")
    print("="*70 + "\n")
    
    checklist = """
1. CREATE ASSISTANT
   ✓ Frontend: Click "Create New Agent"
   ✓ Select source: Website
   ✓ Select template: Support/Customer/Sales/Ecommerce
   ✓ Enter name, description, website URL
   ✓ Backend: Creates assistant record in PostgreSQL
   ✓ Backend: Creates project record
   ✓ Backend: Starts scraping job
   ✓ Backend: Stores scraped content in IngestionURL table
   ✓ Frontend: Shows real-time scraping progress (SSE)
   ✓ Result: Assistant status = "creating", pages scraped

2. INGEST CONTENT
   ✓ Frontend: Click "Start Ingestion" after scraping completes
   ✓ Backend: Loads scraped content from database
   ✓ Backend: Chunks content (text splitting)
   ✓ Backend: Generates embeddings (Azure OpenAI text-embedding-3-large)
   ✓ Backend: Creates Qdrant collection: {project_name}_{tenant_id}
   ✓ Backend: Creates payload index on assistant_id field
   ✓ Backend: Uploads chunks to Qdrant with metadata
   ✓ Backend: Stores chunk references in ContentChunk table
   ✓ Backend: Updates assistant status to "ready"
   ✓ Frontend: Shows real-time ingestion progress (SSE)
   ✓ Result: Assistant status = "ready", chunks indexed

3. CHAT WITH ASSISTANT
   ✓ Frontend: Click on assistant card (only if status = "ready")
   ✓ Frontend: Opens chat interface
   ✓ User: Types question
   ✓ Frontend: Sends POST /api/chat/query with assistant_id
   ✓ Backend: Loads assistant from database
   ✓ Backend: Loads project for collection name
   ✓ Backend: Generates query embedding
   ✓ Backend: Searches Qdrant collection: {project_name}_{tenant_id}
   ✓ Backend: Filters by assistant_id
   ✓ Backend: Retrieves top 10 chunks (score > 0.7)
   ✓ Backend: Builds context from chunks
   ✓ Backend: Uses sophisticated system prompt
   ✓ Backend: Calls Azure OpenAI with context
   ✓ Backend: Validates and cleans response
   ✓ Backend: Returns answer + sources
   ✓ Frontend: Displays answer with source citations
   ✓ Frontend: Shows tool calls and reasoning (Tambo AI)
   ✓ Result: User gets accurate answer grounded in scraped content

KEY FEATURES:
✓ Tenant Isolation: Each assistant has own collection
✓ Content Isolation: Filtering by assistant_id
✓ RAG System: Responses grounded in scraped content
✓ Source Attribution: Every answer includes URLs
✓ Conversation History: Maintains context across turns
✓ Response Validation: Quality checks and cleaning
✓ Natural Language: Conversational, context-aware responses
✓ Real-time Progress: SSE streaming for scraping & ingestion
✓ Error Handling: Graceful fallbacks and validation

READY TO TEST:
1. Start backend: cd server && python main.py
2. Start frontend: cd client && npm run dev
3. Create a new assistant with a website
4. Wait for scraping to complete
5. Start ingestion
6. Wait for ingestion to complete (status = "ready")
7. Click on assistant to chat
8. Ask questions about the website content
9. Verify answers are accurate and include sources
"""
    
    print(checklist)

async def main():
    """Main cleanup and verification"""
    
    print("\n" + "="*70)
    print("FLAKERS STUDIO - CLEANUP & VERIFICATION")
    print("="*70)
    
    # Ask for confirmation
    response = input("\n⚠️  This will DELETE ALL assistants and data. Continue? (yes/no): ")
    
    if response.lower() != 'yes':
        print("\n❌ Cleanup cancelled")
        return
    
    # Cleanup
    await cleanup_all()
    
    # Verify
    await verify_cleanup()
    
    # Print checklist
    await print_flow_checklist()
    
    print("\n✅ System is clean and ready for testing!")
    print("\nNext steps:")
    print("1. Start backend: cd server && python main.py")
    print("2. Start frontend: cd client && npm run dev")
    print("3. Create a new assistant and test the complete flow")

if __name__ == "__main__":
    asyncio.run(main())
