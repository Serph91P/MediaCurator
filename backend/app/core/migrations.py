"""
Database migrations for schema changes.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from loguru import logger


async def migrate_database(db: AsyncSession):
    """Run all necessary database migrations."""
    
    # Check if media_types column exists in cleanup_rules
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('cleanup_rules') 
        WHERE name='media_types'
    """))
    has_media_types = result.scalar() > 0
    
    if not has_media_types:
        logger.info("Migrating cleanup_rules: adding media_types column")
        
        # Add media_types column with default empty array
        await db.execute(text("""
            ALTER TABLE cleanup_rules 
            ADD COLUMN media_types TEXT DEFAULT '[]'
        """))
        
        # Commit the column addition first
        await db.commit()
        
        # Start new transaction for data migration
        # Migrate existing data: convert old media_type to new media_types array
        await db.execute(text("""
            UPDATE cleanup_rules 
            SET media_types = 
                CASE 
                    WHEN media_type = 'movie' THEN '["movie"]'
                    WHEN media_type = 'series' THEN '["series"]'
                    WHEN media_type = 'episode' THEN '["episode"]'
                    ELSE '["movie", "series", "episode"]'
                END
            WHERE media_types = '[]' OR media_types IS NULL
        """))
        
        await db.commit()
        logger.info("Migration completed: media_types column added")
    
    # Check if staging columns exist in media_items
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('media_items') 
        WHERE name='is_staged'
    """))
    has_staging = result.scalar() > 0
    
    if not has_staging:
        logger.info("Migrating media_items: adding staging columns")
        
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN is_staged BOOLEAN DEFAULT 0
        """))
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN staged_at TIMESTAMP
        """))
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN original_path VARCHAR(500)
        """))
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN staged_path VARCHAR(500)
        """))
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN permanent_delete_at TIMESTAMP
        """))
        await db.execute(text("""
            ALTER TABLE media_items 
            ADD COLUMN staged_library_id VARCHAR(100)
        """))
        
        await db.commit()
        logger.info("Migration completed: staging columns added")
