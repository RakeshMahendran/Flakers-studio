"""
Migration: Add resumable pipeline tables
Adds project, ingestion_urls, and ingestion_chunks tables
Updates existing tables for multi-stage pipeline support
"""
import asyncio
from sqlalchemy import text
from app.core.database import async_engine

async def upgrade():
    """Add new tables and update existing ones"""
    async with async_engine.begin() as conn:
        # Create projects table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS projects (
                id UUID PRIMARY KEY,
                tenant_id UUID NOT NULL,
                name VARCHAR(255) NOT NULL,
                description VARCHAR(1000),
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE,
                deleted_at TIMESTAMP WITH TIME ZONE
            );
            
            CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
        """))
        
        # Create ingestion_urls table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_urls (
                id UUID PRIMARY KEY,
                job_id UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
                url VARCHAR(2000) NOT NULL,
                url_hash VARCHAR(64) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'discovered',
                title VARCHAR(500),
                content_type VARCHAR(50),
                language VARCHAR(10),
                word_count INTEGER,
                raw_content TEXT,
                content_length INTEGER,
                token_count INTEGER,
                chunk_count INTEGER,
                scraped_at TIMESTAMP WITH TIME ZONE,
                processed_at TIMESTAMP WITH TIME ZONE,
                failure_reason TEXT,
                retry_count INTEGER DEFAULT 0,
                is_retryable BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
            );
            
            CREATE INDEX IF NOT EXISTS idx_ingestion_urls_job ON ingestion_urls(job_id);
            CREATE INDEX IF NOT EXISTS idx_ingestion_urls_status ON ingestion_urls(status);
            CREATE INDEX IF NOT EXISTS idx_ingestion_urls_hash ON ingestion_urls(url_hash);
            CREATE INDEX IF NOT EXISTS idx_ingestion_urls_job_status ON ingestion_urls(job_id, status);
            CREATE INDEX IF NOT EXISTS idx_ingestion_urls_job_hash ON ingestion_urls(job_id, url_hash);
        """))
        
        # Create ingestion_chunks table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS ingestion_chunks (
                id UUID PRIMARY KEY,
                url_id UUID NOT NULL REFERENCES ingestion_urls(id) ON DELETE CASCADE,
                job_id UUID NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
                chunk_id VARCHAR(100) NOT NULL UNIQUE,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                content_hash VARCHAR(64) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'queued',
                qdrant_point_id VARCHAR(100) UNIQUE,
                intent VARCHAR(50),
                confidence_score FLOAT,
                chunk_size INTEGER,
                failure_reason TEXT,
                retry_count INTEGER DEFAULT 0,
                is_retryable BOOLEAN DEFAULT TRUE,
                last_retry_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE,
                uploaded_at TIMESTAMP WITH TIME ZONE
            );
            
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_url ON ingestion_chunks(url_id);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_job ON ingestion_chunks(job_id);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_status ON ingestion_chunks(status);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_chunk_id ON ingestion_chunks(chunk_id);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_hash ON ingestion_chunks(content_hash);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_job_status ON ingestion_chunks(job_id, status);
            CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_url_status ON ingestion_chunks(url_id, status);
        """))
        
        # Add project_id to assistants table if not exists
        await conn.execute(text("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='assistants' AND column_name='project_id'
                ) THEN
                    ALTER TABLE assistants ADD COLUMN project_id UUID;
                    CREATE INDEX idx_assistants_project ON assistants(project_id);
                END IF;
            END $$;
        """))
        
        # Update ingestion_jobs table
        await conn.execute(text("""
            DO $$ 
            BEGIN
                -- Add new columns if they don't exist
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='project_id') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN project_id UUID;
                    CREATE INDEX idx_ingestion_jobs_project ON ingestion_jobs(project_id);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='tenant_id') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN tenant_id UUID;
                    CREATE INDEX idx_ingestion_jobs_tenant ON ingestion_jobs(tenant_id);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='current_stage') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN current_stage VARCHAR(50);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='total_urls_discovered') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN total_urls_discovered INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_scraped') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_scraped INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_failed_scraping') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_failed_scraping INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_processed') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_processed INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_failed_processing') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_failed_processing INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_completed') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_completed INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_partial') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_partial INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='urls_failed') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN urls_failed INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='total_chunks_created') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN total_chunks_created INTEGER;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='chunks_uploaded') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN chunks_uploaded INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='chunks_failed') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN chunks_failed INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='chunks_retrying') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN chunks_retrying INTEGER DEFAULT 0;
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='cancellation_requested') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN cancellation_requested BOOLEAN DEFAULT FALSE;
                    CREATE INDEX idx_ingestion_jobs_cancellation ON ingestion_jobs(cancellation_requested);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='cancellation_reason') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN cancellation_reason VARCHAR(500);
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ingestion_jobs' AND column_name='cancelled_at') THEN
                    ALTER TABLE ingestion_jobs ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;
        """))
        
        print("Migration completed successfully")

async def downgrade():
    """Remove new tables and columns"""
    async with async_engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS ingestion_chunks CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS ingestion_urls CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS projects CASCADE;"))
        
        # Remove added columns from ingestion_jobs
        await conn.execute(text("""
            ALTER TABLE ingestion_jobs 
            DROP COLUMN IF EXISTS project_id,
            DROP COLUMN IF EXISTS tenant_id,
            DROP COLUMN IF EXISTS current_stage,
            DROP COLUMN IF EXISTS total_urls_discovered,
            DROP COLUMN IF EXISTS urls_scraped,
            DROP COLUMN IF EXISTS urls_failed_scraping,
            DROP COLUMN IF EXISTS urls_processed,
            DROP COLUMN IF EXISTS urls_failed_processing,
            DROP COLUMN IF EXISTS urls_completed,
            DROP COLUMN IF EXISTS urls_partial,
            DROP COLUMN IF EXISTS urls_failed,
            DROP COLUMN IF EXISTS total_chunks_created,
            DROP COLUMN IF EXISTS chunks_uploaded,
            DROP COLUMN IF EXISTS chunks_failed,
            DROP COLUMN IF EXISTS chunks_retrying,
            DROP COLUMN IF EXISTS cancellation_requested,
            DROP COLUMN IF EXISTS cancellation_reason,
            DROP COLUMN IF EXISTS cancelled_at;
        """))
        
        # Remove project_id from assistants
        await conn.execute(text("ALTER TABLE assistants DROP COLUMN IF EXISTS project_id;"))
        
        print("Downgrade completed successfully")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        asyncio.run(downgrade())
    else:
        asyncio.run(upgrade())
