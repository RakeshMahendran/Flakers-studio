#!/usr/bin/env python3
"""
Migration script to update Qdrant collections for text-embedding-3-large
"""
import asyncio
import logging
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from app.core.config import settings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def migrate_collections():
    """Migrate Qdrant collections to use 3072 dimensions for text-embedding-3-large"""
    try:
        # Initialize Qdrant client
        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None
        )
        
        # Get existing collections
        collections = client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        logger.info(f"Found existing collections: {collection_names}")
        
        # Collections that need migration
        collections_to_migrate = []
        
        # Check main collection
        main_collection = "flakers_content"
        if main_collection in collection_names:
            collections_to_migrate.append(main_collection)
        
        # Check project-specific collections
        for col_name in collection_names:
            if col_name.startswith("project_"):
                collections_to_migrate.append(col_name)
        
        if not collections_to_migrate:
            logger.info("No collections need migration")
            return
        
        logger.info(f"Collections to migrate: {collections_to_migrate}")
        
        # Migrate each collection
        for collection_name in collections_to_migrate:
            logger.info(f"Migrating collection: {collection_name}")
            
            # Get collection info to check current vector size
            try:
                collection_info = client.get_collection(collection_name)
                current_size = collection_info.config.params.vectors.size
                
                if current_size == 3072:
                    logger.info(f"Collection {collection_name} already has correct dimensions (3072)")
                    continue
                
                logger.info(f"Collection {collection_name} has {current_size} dimensions, needs migration to 3072")
                
                # For now, we'll delete and recreate the collection
                # In production, you might want to backup data first
                logger.warning(f"Deleting collection {collection_name} - all data will be lost!")
                client.delete_collection(collection_name)
                
                # Recreate with correct dimensions
                client.create_collection(
                    collection_name=collection_name,
                    vectors_config=VectorParams(
                        size=3072,  # text-embedding-3-large dimension
                        distance=Distance.COSINE
                    )
                )
                
                logger.info(f"Recreated collection {collection_name} with 3072 dimensions")
                
            except Exception as e:
                logger.error(f"Error migrating collection {collection_name}: {e}")
                continue
        
        logger.info("Migration completed successfully")
        
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(migrate_collections())