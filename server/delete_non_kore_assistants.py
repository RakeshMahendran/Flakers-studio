"""
Delete all assistants except Kore AI
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database URL
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("DATABASE_URL not found in environment")
    exit(1)

try:
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    # First, get all assistants
    cursor.execute("""
        SELECT id, name, site_url
        FROM assistants
        ORDER BY created_at DESC
    """)
    
    assistants = cursor.fetchall()
    
    print(f"\n{'='*80}")
    print(f"FOUND {len(assistants)} ASSISTANTS")
    print(f"{'='*80}\n")
    
    assistants_to_delete = []
    kore_ai_id = None
    
    for assistant in assistants:
        aid, name, site_url = assistant
        
        # Check if this is KoreAI
        if 'kore' in name.lower() or (site_url and 'kore' in site_url.lower()):
            print(f"✅ KEEPING: {name} (ID: {aid})")
            kore_ai_id = aid
        else:
            print(f"❌ WILL DELETE: {name} (ID: {aid})")
            assistants_to_delete.append((aid, name))
    
    print(f"\n{'='*80}")
    print(f"ASSISTANTS TO DELETE: {len(assistants_to_delete)}")
    print(f"{'='*80}\n")
    
    if not assistants_to_delete:
        print("No assistants to delete. Only Kore AI exists.")
        cursor.close()
        conn.close()
        exit(0)
    
    # Confirm deletion
    print("Proceeding with deletion...\n")
    
    deleted_count = 0
    for aid, name in assistants_to_delete:
        try:
            print(f"Deleting assistant: {name} (ID: {aid})")
            
            # Delete related records in correct order to avoid foreign key constraint violations
            
            # 1. Get all chat sessions for this assistant
            cursor.execute("SELECT id FROM chat_sessions WHERE assistant_id = %s", (aid,))
            session_ids = [row[0] for row in cursor.fetchall()]
            
            # 2. Delete chat messages for these sessions
            if session_ids:
                # Convert to proper UUID array format
                placeholders = ','.join(['%s'] * len(session_ids))
                cursor.execute(f"DELETE FROM chat_messages WHERE session_id IN ({placeholders})", session_ids)
                messages_deleted = cursor.rowcount
                if messages_deleted > 0:
                    print(f"  ✓ Deleted {messages_deleted} chat messages")
            
            # 3. Delete chat sessions
            cursor.execute("DELETE FROM chat_sessions WHERE assistant_id = %s", (aid,))
            sessions_deleted = cursor.rowcount
            if sessions_deleted > 0:
                print(f"  ✓ Deleted {sessions_deleted} chat sessions")
            
            # 4. Delete ingestion jobs
            cursor.execute("DELETE FROM ingestion_jobs WHERE assistant_id = %s", (aid,))
            jobs_deleted = cursor.rowcount
            if jobs_deleted > 0:
                print(f"  ✓ Deleted {jobs_deleted} ingestion jobs")
            
            # 5. Delete content chunks
            cursor.execute("DELETE FROM content_chunks WHERE assistant_id = %s", (aid,))
            chunks_deleted = cursor.rowcount
            if chunks_deleted > 0:
                print(f"  ✓ Deleted {chunks_deleted} content chunks")
            
            # 6. Finally delete the assistant
            cursor.execute("DELETE FROM assistants WHERE id = %s", (aid,))
            
            # Commit after each successful deletion
            conn.commit()
            
            deleted_count += 1
            print(f"  ✓ Deleted assistant from database\n")
            
        except Exception as e:
            print(f"  ✗ Error deleting {name}: {e}\n")
            conn.rollback()
            continue
    
    # Commit all deletions
    # Already committed in the loop
    
    print(f"\n{'='*80}")
    print(f"✅ SUCCESSFULLY DELETED {deleted_count} ASSISTANTS")
    print(f"✅ KEPT: Kore AI (ID: {kore_ai_id})")
    print(f"{'='*80}\n")
    
    # Verify remaining assistants
    cursor.execute("SELECT COUNT(*) FROM assistants")
    remaining = cursor.fetchone()[0]
    print(f"Remaining assistants in database: {remaining}\n")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
