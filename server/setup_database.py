"""
Database setup script for FlakersStudio
Run this to create the database and tables
"""
import asyncio
import asyncpg
from sqlalchemy import text
from app.core.database import async_engine
from app.core.config import settings

async def create_database():
    """Create the database if it doesn't exist"""
    try:
        # Extract database info from URL
        db_url_parts = settings.DATABASE_URL.replace("postgresql://", "").split("/")
        connection_part = db_url_parts[0]  # postgres:password@localhost:5432
        db_name = db_url_parts[1]  # flakersstudiodb
        
        user_pass, host_port = connection_part.split("@")
        user, password = user_pass.split(":")
        host, port = host_port.split(":")
        
        # Connect to postgres database to create our database
        conn = await asyncpg.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database="postgres"
        )
        
        # Check if database exists
        result = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        
        if not result:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"✅ Created database: {db_name}")
        else:
            print(f"✅ Database already exists: {db_name}")
            
        await conn.close()
        
    except Exception as e:
        print(f"❌ Database creation error: {e}")
        print("Make sure PostgreSQL is running and credentials are correct")

async def create_tables():
    """Create all tables"""
    try:
        from app.models import assistant, content, chat
        
        async with async_engine.begin() as conn:
            # Import all models to ensure they're registered
            from app.core.database import Base
            
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            print("✅ Created all database tables")
            
    except Exception as e:
        print(f"❌ Table creation error: {e}")

async def main():
    print("🚀 Setting up FlakersStudio database...")
    
    await create_database()
    await create_tables()
    
    print("✅ Database setup complete!")
    print("You can now run: python main.py")

if __name__ == "__main__":
    asyncio.run(main())