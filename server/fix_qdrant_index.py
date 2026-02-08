"""
Fix Qdrant collections by adding assistant_id index
Run this script to add the missing index to existing collections
"""
import asyncio
from qdrant_client import QdrantClient
from qdrant_client.models import PayloadSchemaType
from app.core.config import settings

async def fix_qdrant_indexes():
    """Add assistant_id index to all existing collections"""
    
    # Initialize Qdrant client
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
    )
    
    print("Fetching all collections...")
    collections = client.get_collections()
    
    for collection in collections.collections:
        collection_name = collection.name
        print(f"\nProcessing collection: {collection_name}")
        
        try:
            # Create payload index for assistant_id
            client.create_payload_index(
                collection_name=collection_name,
                field_name="assistant_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print(f"✓ Created assistant_id index for: {collection_name}")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"✓ Index already exists for: {collection_name}")
            else:
                print(f"✗ Error creating index for {collection_name}: {e}")
    
    print("\n✅ Finished processing all collections")

if __name__ == "__main__":
    asyncio.run(fix_qdrant_indexes())
