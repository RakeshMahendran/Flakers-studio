"""
Migration: Add project_id column to assistants table
Run this script to add the project_id column to existing assistants
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.core.database import async_engine
import uuid

async def add_project_id_column():
    """Add project_id column to assistants table"""
    async with async_engine.begin() as conn:
        try:
            # Check if column exists
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='assistants' AND column_name='project_id'
            """)
            result = await conn.execute(check_query)
            exists = result.fetchone()
            
            if exists:
                print("✓ Column 'project_id' already exists")
                return
            
            # First, create a default project if none exists
            create_project_query = text("""
                INSERT INTO projects (id, tenant_id, name, description, status, created_at)
                SELECT 
                    gen_random_uuid(),
                    tenant_id,
                    'Default Project',
                    'Auto-created project for existing assistants',
                    'ACTIVE'::projectstatus,
                    NOW()
                FROM assistants
                WHERE NOT EXISTS (SELECT 1 FROM projects LIMIT 1)
                LIMIT 1
                RETURNING id
            """)
            result = await conn.execute(create_project_query)
            project_row = result.fetchone()
            
            if project_row:
                default_project_id = project_row[0]
                print(f"✓ Created default project: {default_project_id}")
            else:
                # Get existing project
                get_project_query = text("SELECT id FROM projects LIMIT 1")
                result = await conn.execute(get_project_query)
                project_row = result.fetchone()
                if project_row:
                    default_project_id = project_row[0]
                    print(f"✓ Using existing project: {default_project_id}")
                else:
                    # Create a new project with a fixed UUID
                    fixed_uuid = str(uuid.uuid4())
                    create_fixed_project_query = text("""
                        INSERT INTO projects (id, tenant_id, name, description, status, created_at)
                        VALUES (:id, :tenant_id, 'Default Project', 'Auto-created project', 'ACTIVE'::projectstatus, NOW())
                        RETURNING id
                    """)
                    result = await conn.execute(create_fixed_project_query, {
                        "id": fixed_uuid,
                        "tenant_id": str(uuid.uuid4())
                    })
                    default_project_id = fixed_uuid
                    print(f"✓ Created new default project: {default_project_id}")
            
            # Add the column (nullable first)
            add_column_query = text("""
                ALTER TABLE assistants 
                ADD COLUMN project_id UUID
            """)
            await conn.execute(add_column_query)
            print("✓ Added 'project_id' column to assistants table")
            
            # Update existing records to use the default project
            update_query = text("""
                UPDATE assistants 
                SET project_id = :project_id
                WHERE project_id IS NULL
            """)
            result = await conn.execute(update_query, {"project_id": default_project_id})
            print(f"✓ Updated {result.rowcount} existing assistants with project_id")
            
            # Make the column NOT NULL
            make_not_null_query = text("""
                ALTER TABLE assistants 
                ALTER COLUMN project_id SET NOT NULL
            """)
            await conn.execute(make_not_null_query)
            print("✓ Made project_id column NOT NULL")
            
            # Add foreign key constraint
            add_fk_query = text("""
                ALTER TABLE assistants 
                ADD CONSTRAINT fk_assistants_project 
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            """)
            await conn.execute(add_fk_query)
            print("✓ Added foreign key constraint")
            
            # Add index
            add_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_assistants_project_id 
                ON assistants(project_id)
            """)
            await conn.execute(add_index_query)
            print("✓ Added index on project_id")
            
        except Exception as e:
            print(f"✗ Error adding project_id column: {e}")
            raise

if __name__ == "__main__":
    print("Adding project_id column to assistants table...")
    asyncio.run(add_project_id_column())
    print("Migration complete!")
