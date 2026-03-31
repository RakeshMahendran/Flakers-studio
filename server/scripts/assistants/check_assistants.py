"""
Check all assistants in database
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

# Parse connection string
# Format: postgresql://user:password@host:port/dbname
try:
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    # Query all assistants
    cursor.execute("""
        SELECT id, name, site_url, template, status, created_at, is_active
        FROM assistants
        ORDER BY created_at DESC
    """)
    
    assistants = cursor.fetchall()
    
    print(f"\n{'='*80}")
    print(f"TOTAL ASSISTANTS: {len(assistants)}")
    print(f"{'='*80}\n")
    
    kore_ai_found = False
    
    for idx, assistant in enumerate(assistants, 1):
        aid, name, site_url, template, status, created_at, is_active = assistant
        
        print(f"{idx}. {name}")
        print(f"   ID: {aid}")
        print(f"   Site URL: {site_url}")
        print(f"   Template: {template}")
        print(f"   Status: {status}")
        print(f"   Is Active: {is_active}")
        print(f"   Created: {created_at}")
        
        # Check if this is KoreAI
        if 'kore' in name.lower() or (site_url and 'kore' in site_url.lower()):
            kore_ai_found = True
            print(f"   ⭐ KOREAI FOUND!")
        print()
    
    print(f"{'='*80}")
    if kore_ai_found:
        print("✅ KoreAI assistant EXISTS in the database")
    else:
        print("❌ KoreAI assistant NOT FOUND in the database")
    print(f"{'='*80}\n")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
