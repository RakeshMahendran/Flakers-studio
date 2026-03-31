"""
Database setup script for FlakersStudio
Run this to create the database and tables
"""
import asyncio
from pathlib import Path
import sys

import asyncpg

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config.database import Base, async_engine
from backend.config.settings import settings


async def create_database():
    """Create the database if it doesn't exist."""
    try:
        db_url_parts = settings.DATABASE_URL.replace("postgresql://", "").split("/")
        connection_part = db_url_parts[0]
        db_name = db_url_parts[1]

        user_pass, host_port = connection_part.split("@")
        user, password = user_pass.split(":")
        host, port = host_port.split(":")

        conn = await asyncpg.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database="postgres",
        )

        result = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )

        if not result:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Created database: {db_name}")
        else:
            print(f"Database already exists: {db_name}")

        await conn.close()
    except Exception as exc:
        print(f"Database creation error: {exc}")
        print("Make sure PostgreSQL is running and credentials are correct")


async def create_tables():
    """Create all application tables."""
    try:
        from backend.models import (
            api_keys,
            assistant,
            chat,
            content,
            ingestion_tracking,
            membership,
            project,
            tenant,
            user,
        )

        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            print("Created all database tables")
    except Exception as exc:
        print(f"Table creation error: {exc}")


async def main():
    print("Setting up FlakersStudio database...")

    await create_database()
    await create_tables()

    print("Database setup complete!")
    print("You can now run: python server/main.py")


if __name__ == "__main__":
    asyncio.run(main())
