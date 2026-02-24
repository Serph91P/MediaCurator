"""
Database configuration and session management.
Supports SQLite (default) and PostgreSQL.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from loguru import logger
from .config import get_settings

settings = get_settings()

# Get effective database URL (PostgreSQL if configured, else SQLite)
database_url = settings.effective_database_url

# Detect database type for connection pool settings
is_sqlite = database_url.startswith("sqlite")
is_postgres = database_url.startswith("postgresql")

# Log database type
if is_postgres:
    # Mask password in log
    masked_url = database_url.replace(settings.postgres_password or "", "***") if settings.postgres_password else database_url
    logger.info(f"Using PostgreSQL database: {masked_url}")
else:
    logger.info(f"Using SQLite database: {database_url}")

# Create async engine with appropriate settings
engine_kwargs = {
    "echo": settings.debug,
    "future": True,
}

# PostgreSQL specific: use connection pooling
if is_postgres:
    engine_kwargs.update({
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,  # Check connection health
    })
else:
    # SQLite: use NullPool to avoid threading issues
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(database_url, **engine_kwargs)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Close database connections."""
    await engine.dispose()


def escape_like(value: str) -> str:
    """Escape LIKE/ILIKE metacharacters in user-supplied search strings."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
