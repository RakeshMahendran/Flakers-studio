"""
Quick fix script to convert String boolean columns to actual Boolean type
Run this to fix the database schema issue
"""
import asyncio
import sys
from sqlalchemy import text

sys.path.insert(0, '.')

from app.core.database import engine

async def fix_boolean_columns():
    """Fix the boolean columns in content_chunks table"""
    
    print("🔧 Fixing boolean columns in content_chunks table...")
    
    async with engine.begin() as conn:
        # Check if table exists
        result = await conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'content_chunks'
            );
        """))
        
        table_exists = result.scalar()
        
        if not table_exists:
            print("✅ Table content_chunks doesn't exist yet - no fix needed")
            return
        
        # Check current column types
        result = await conn.execute(text("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'content_chunks' 
            AND column_name IN ('requires_attribution', 'is_policy_content', 'is_sensitive');
        """))
        
        columns = {row[0]: row[1] for row in result}
        
        print(f"\n📊 Current column types:")
        for col, dtype in columns.items():
            print(f"   {col}: {dtype}")
        
        # Fix requires_attribution
        if columns.get('requires_attribution') != 'boolean':
            print(f"\n🔄 Converting requires_attribution to BOOLEAN...")
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN requires_attribution TYPE BOOLEAN 
                USING CASE 
                    WHEN requires_attribution IN ('true', 't', 'yes', '1', 'True') THEN TRUE
                    WHEN requires_attribution IN ('false', 'f', 'no', '0', 'False') THEN FALSE
                    ELSE TRUE
                END
            """))
            
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN requires_attribution SET DEFAULT TRUE
            """))
            print("   ✅ requires_attribution converted to BOOLEAN")
        else:
            print(f"\n✅ requires_attribution is already BOOLEAN")
        
        # Fix is_policy_content
        if columns.get('is_policy_content') != 'boolean':
            print(f"\n🔄 Converting is_policy_content to BOOLEAN...")
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN is_policy_content TYPE BOOLEAN 
                USING CASE 
                    WHEN is_policy_content IN ('true', 't', 'yes', '1', 'True') THEN TRUE
                    WHEN is_policy_content IN ('false', 'f', 'no', '0', 'False') THEN FALSE
                    ELSE FALSE
                END
            """))
            
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN is_policy_content SET DEFAULT FALSE
            """))
            print("   ✅ is_policy_content converted to BOOLEAN")
        else:
            print(f"\n✅ is_policy_content is already BOOLEAN")
        
        # Fix is_sensitive
        if columns.get('is_sensitive') != 'boolean':
            print(f"\n🔄 Converting is_sensitive to BOOLEAN...")
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN is_sensitive TYPE BOOLEAN 
                USING CASE 
                    WHEN is_sensitive IN ('true', 't', 'yes', '1', 'True') THEN TRUE
                    WHEN is_sensitive IN ('false', 'f', 'no', '0', 'False') THEN FALSE
                    ELSE FALSE
                END
            """))
            
            await conn.execute(text("""
                ALTER TABLE content_chunks 
                ALTER COLUMN is_sensitive SET DEFAULT FALSE
            """))
            print("   ✅ is_sensitive converted to BOOLEAN")
        else:
            print(f"\n✅ is_sensitive is already BOOLEAN")
        
        # Verify the changes
        result = await conn.execute(text("""
            SELECT column_name, data_type, column_default
            FROM information_schema.columns 
            WHERE table_name = 'content_chunks' 
            AND column_name IN ('requires_attribution', 'is_policy_content', 'is_sensitive');
        """))
        
        print(f"\n✅ Final column types:")
        for row in result:
            print(f"   {row[0]}: {row[1]} (default: {row[2]})")
    
    print(f"\n🎉 Database schema fixed successfully!")
    print(f"   All boolean columns are now proper BOOLEAN type")

if __name__ == "__main__":
    asyncio.run(fix_boolean_columns())
