"""
Quick migration runner to add missing columns to ingestion_jobs
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_engine

async def run_migration():
    """Add missing columns to ingestion_jobs table"""
    async with async_engine.begin() as conn:
        # Add project_id column
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS project_id UUID
            """))
            print("✓ Added project_id column")
        except Exception as e:
            print(f"project_id: {e}")
        
        # Add tenant_id column
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID
            """))
            print("✓ Added tenant_id column")
        except Exception as e:
            print(f"tenant_id: {e}")
        
        # Add current_stage column
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50)
            """))
            print("✓ Added current_stage column")
        except Exception as e:
            print(f"current_stage: {e}")
        
        # Add URL tracking columns
        columns = [
            "total_urls_discovered INTEGER DEFAULT 0",
            "urls_scraped INTEGER DEFAULT 0",
            "urls_failed_scraping INTEGER DEFAULT 0",
            "urls_processed INTEGER DEFAULT 0",
            "urls_failed_processing INTEGER DEFAULT 0",
            "urls_completed INTEGER DEFAULT 0",
            "urls_partial INTEGER DEFAULT 0",
            "urls_failed INTEGER DEFAULT 0",
        ]
        
        for col_def in columns:
            col_name = col_def.split()[0]
            try:
                await conn.execute(text(f"""
                    ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS {col_def}
                """))
                print(f"✓ Added {col_name} column")
            except Exception as e:
                print(f"{col_name}: {e}")
        
        # Add chunk tracking columns
        chunk_columns = [
            "total_chunks_created INTEGER",
            "chunks_uploaded INTEGER DEFAULT 0",
            "chunks_failed INTEGER DEFAULT 0",
            "chunks_retrying INTEGER DEFAULT 0",
        ]
        
        for col_def in chunk_columns:
            col_name = col_def.split()[0]
            try:
                await conn.execute(text(f"""
                    ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS {col_def}
                """))
                print(f"✓ Added {col_name} column")
            except Exception as e:
                print(f"{col_name}: {e}")
        
        # Add cancellation columns
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN DEFAULT FALSE
            """))
            print("✓ Added cancellation_requested column")
        except Exception as e:
            print(f"cancellation_requested: {e}")
        
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(500)
            """))
            print("✓ Added cancellation_reason column")
        except Exception as e:
            print(f"cancellation_reason: {e}")
        
        try:
            await conn.execute(text("""
                ALTER TABLE ingestion_jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE
            """))
            print("✓ Added cancelled_at column")
        except Exception as e:
            print(f"cancelled_at: {e}")
        
        # Create indexes
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_project ON ingestion_jobs(project_id)
            """))
            print("✓ Created project_id index")
        except Exception as e:
            print(f"project_id index: {e}")
        
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant ON ingestion_jobs(tenant_id)
            """))
            print("✓ Created tenant_id index")
        except Exception as e:
            print(f"tenant_id index: {e}")
        
        try:
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_cancellation ON ingestion_jobs(cancellation_requested)
            """))
            print("✓ Created cancellation_requested index")
        except Exception as e:
            print(f"cancellation_requested index: {e}")
        
        print("\n✅ Migration completed!")

if __name__ == "__main__":
    asyncio.run(run_migration())
