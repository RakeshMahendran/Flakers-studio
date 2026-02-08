"""
Clean up Qdrant vector database collections
"""
from qdrant_client import QdrantClient
from app.core.config import settings

def cleanup_qdrant():
    print("=" * 60)
    print("QDRANT VECTOR DATABASE CLEANUP")
    print("=" * 60)
    
    try:
        # Initialize Qdrant client
        print(f"\nConnecting to Qdrant at {settings.QDRANT_URL}...")
        client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY if hasattr(settings, 'QDRANT_API_KEY') else None
        )
        
        # Get all collections
        collections = client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if not collection_names:
            print("\n✓ No collections found in Qdrant!")
            print("Vector database is already clean.")
        else:
            print(f"\nFound {len(collection_names)} collections:")
            for name in collection_names:
                # Get collection info
                try:
                    info = client.get_collection(collection_name=name)
                    point_count = info.points_count
                    print(f"  - {name} ({point_count} vectors)")
                except:
                    print(f"  - {name}")
            
            print("\nDeleting all collections...")
            for name in collection_names:
                try:
                    client.delete_collection(collection_name=name)
                    print(f"  ✓ Deleted: {name}")
                except Exception as e:
                    print(f"  ✗ Failed to delete {name}: {str(e)}")
            
            print("\n✓ All collections deleted!")
        
        print("\n" + "=" * 60)
        print("✅ QDRANT CLEANUP COMPLETE!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ Error: {str(e)}")
        print("\nPossible issues:")
        print("  1. Qdrant is not running")
        print("  2. Wrong URL or API key in .env")
        print("  3. Network connectivity issue")
        print(f"\nQdrant URL: {settings.QDRANT_URL}")

if __name__ == "__main__":
    cleanup_qdrant()
