"""
Migration: Add is_active column to assistants table
Run this script to add the is_active column to existing assistants
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.core.database import async_engine

async def add_is_active_column():
    """Add is_active column to assistants table"""
    async with async_engine.begin() as conn:
        try:
            # Check if column exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='assistants' AND column_name='is_active'
            """)
            result = await conn.execute(check_query)
            exists = result.fetchone()
            
            if exists:
                print("✓ Column 'is_active' already exists")
                return
            
            # Add the column with default value
            add_column_query = text("""
                ALTER TABLE assistants 
                ADD COLUMN is_active BOOLEAN DEFAULT TRUE
            """)
            await conn.execute(add_column_query)
            print("✓ Added 'is_active' column to assistants table")
            
            # Update existing records to have is_active = true
            update_query = text("""
                UPDATE assistants 
                SET is_active = TRUE 
                WHERE is_active IS NULL
            """)
            result = await conn.execute(update_query)
            print(f"✓ Updated {result.rowcount} existing assistants to is_active=true")
            
        except Exception as e:
            print(f"✗ Error adding is_active column: {e}")
            raise

if __name__ == "__main__":
    print("Adding is_active column to assistants table...")
    asyncio.run(add_is_active_column())
    print("Migration complete!")
