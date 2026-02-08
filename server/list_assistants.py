"""
List all existing assistants and check for KoreAI
"""
import asyncio
from sqlalchemy import select
from app.core.database import get_db
from app.models.assistant import Assistant

async def list_assistants():
    async for db in get_db():
        try:
            # Query all assistants
            result = await db.execute(select(Assistant))
            assistants = result.scalars().all()
            
            print(f"\n{'='*80}")
            print(f"TOTAL ASSISTANTS: {len(assistants)}")
            print(f"{'='*80}\n")
            
            kore_ai_found = False
            
            for idx, assistant in enumerate(assistants, 1):
                print(f"{idx}. {assistant.name}")
                print(f"   ID: {assistant.id}")
                print(f"   Site URL: {assistant.site_url}")
                print(f"   Template: {assistant.template}")
                print(f"   Status: {assistant.status}")
                print(f"   Is Active: {getattr(assistant, 'is_active', 'N/A')}")
                print(f"   Created: {assistant.created_at}")
                print()
                
                # Check if this is KoreAI
                if 'kore' in assistant.name.lower() or 'kore' in assistant.site_url.lower():
                    kore_ai_found = True
                    print(f"   ⭐ KOREAI FOUND!")
                    print()
            
            print(f"{'='*80}")
            if kore_ai_found:
                print("✅ KoreAI assistant EXISTS in the database")
            else:
                print("❌ KoreAI assistant NOT FOUND in the database")
            print(f"{'='*80}\n")
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            break

if __name__ == "__main__":
    asyncio.run(list_assistants())
