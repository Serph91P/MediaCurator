"""
Database migrations for schema changes.
Supports both SQLite and PostgreSQL.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from loguru import logger
from .database import is_postgres


async def column_exists(db: AsyncSession, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table. Works with both SQLite and PostgreSQL."""
    if is_postgres:
        result = await db.execute(text("""
            SELECT COUNT(*) as count 
            FROM information_schema.columns 
            WHERE table_name = :table_name AND column_name = :column_name
        """), {"table_name": table_name, "column_name": column_name})
    else:
        result = await db.execute(text(f"""
            SELECT COUNT(*) as count 
            FROM pragma_table_info('{table_name}') 
            WHERE name = :column_name
        """), {"column_name": column_name})
    return result.scalar() > 0


async def table_exists(db: AsyncSession, table_name: str) -> bool:
    """Check if a table exists. Works with both SQLite and PostgreSQL."""
    if is_postgres:
        result = await db.execute(text("""
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_name = :table_name AND table_schema = 'public'
        """), {"table_name": table_name})
    else:
        result = await db.execute(text("""
            SELECT COUNT(*) as count 
            FROM sqlite_master 
            WHERE type='table' AND name = :table_name
        """), {"table_name": table_name})
    return result.scalar() > 0


async def migrate_database(db: AsyncSession):
    """Run all necessary database migrations."""
    
    # Check if old media_type column exists (needs migration)
    has_old_media_type = await column_exists(db, 'cleanup_rules', 'media_type')
    has_media_types = await column_exists(db, 'cleanup_rules', 'media_types')
    
    if has_old_media_type and not has_media_types:
        logger.info("Migrating cleanup_rules: removing old media_type column and adding media_types")
        
        if is_postgres:
            # PostgreSQL supports ADD COLUMN and DROP COLUMN
            await db.execute(text("""
                ALTER TABLE cleanup_rules 
                ADD COLUMN IF NOT EXISTS media_types TEXT NOT NULL DEFAULT '[]'
            """))
            
            # Migrate data from old column
            await db.execute(text("""
                UPDATE cleanup_rules SET media_types = 
                    CASE 
                        WHEN media_type = 'movie' THEN '["movie"]'
                        WHEN media_type = 'series' THEN '["series"]'
                        WHEN media_type = 'episode' THEN '["episode"]'
                        ELSE '["movie"]'
                    END
            """))
            
            # Drop old column
            await db.execute(text("ALTER TABLE cleanup_rules DROP COLUMN IF EXISTS media_type"))
        else:
            # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
            await db.execute(text("""
                CREATE TABLE cleanup_rules_new (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    is_enabled BOOLEAN DEFAULT 1,
                    priority INTEGER DEFAULT 0,
                    media_types TEXT NOT NULL DEFAULT '[]',
                    library_id INTEGER,
                    conditions TEXT NOT NULL DEFAULT '{}',
                    action VARCHAR(50) DEFAULT 'DELETE',
                    grace_period_days INTEGER DEFAULT 7,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP,
                    FOREIGN KEY (library_id) REFERENCES libraries(id)
                )
            """))
            
            await db.execute(text("""
                INSERT INTO cleanup_rules_new 
                    (id, name, description, is_enabled, priority, media_types, library_id, 
                     conditions, action, grace_period_days, created_at, updated_at)
                SELECT 
                    id, name, description, is_enabled, priority,
                    CASE 
                        WHEN media_type = 'movie' THEN '["movie"]'
                        WHEN media_type = 'series' THEN '["series"]'
                        WHEN media_type = 'episode' THEN '["episode"]'
                        ELSE '["movie"]'
                    END as media_types,
                    library_id, conditions, action, grace_period_days, created_at, updated_at
                FROM cleanup_rules
            """))
            
            await db.execute(text("DROP TABLE cleanup_rules"))
            await db.execute(text("ALTER TABLE cleanup_rules_new RENAME TO cleanup_rules"))
        
        await db.commit()
        logger.info("Migration completed: media_type column removed, media_types added")
    
    # Check if staging columns exist in media_items
    has_staging = await column_exists(db, 'media_items', 'is_staged')
    
    if not has_staging:
        logger.info("Migrating media_items: adding staging columns")
        
        if is_postgres:
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT FALSE"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS staged_at TIMESTAMP"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS original_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS staged_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS permanent_delete_at TIMESTAMP"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN IF NOT EXISTS staged_library_id VARCHAR(100)"))
        else:
            await db.execute(text("ALTER TABLE media_items ADD COLUMN is_staged BOOLEAN DEFAULT 0"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN staged_at TIMESTAMP"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN original_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN staged_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN permanent_delete_at TIMESTAMP"))
            await db.execute(text("ALTER TABLE media_items ADD COLUMN staged_library_id VARCHAR(100)"))
        
        await db.commit()
        logger.info("Migration completed: staging columns added")
    
    # Add database indexes for performance
    logger.info("Checking and creating database indexes...")
    
    # Index for media_items queries
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_media_items_external_id 
        ON media_items(external_id)
    """))
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_media_items_service_connection 
        ON media_items(service_connection_id)
    """))
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_media_items_media_type 
        ON media_items(media_type)
    """))
    
    # Index for libraries queries
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_libraries_service_external 
        ON libraries(service_connection_id, external_id)
    """))
    
    # Index for cleanup_logs queries
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_cleanup_logs_created_at 
        ON cleanup_logs(created_at DESC)
    """))
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_cleanup_logs_media_item 
        ON cleanup_logs(media_item_id)
    """))
    await db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_cleanup_logs_rule 
        ON cleanup_logs(rule_id)
    """))
    
    await db.commit()
    logger.info("Database indexes created successfully")

    # Check if refresh_tokens table exists
    has_refresh_tokens = await table_exists(db, 'refresh_tokens')
    
    if not has_refresh_tokens:
        logger.info("Creating refresh_tokens table for session management")
        
        if is_postgres:
            await db.execute(text("""
                CREATE TABLE refresh_tokens (
                    id SERIAL PRIMARY KEY,
                    token VARCHAR(255) NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    revoked_at TIMESTAMP,
                    device_info VARCHAR(255),
                    ip_address VARCHAR(45),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """))
        else:
            await db.execute(text("""
                CREATE TABLE refresh_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token VARCHAR(255) NOT NULL UNIQUE,
                    user_id INTEGER NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    revoked_at TIMESTAMP,
                    device_info VARCHAR(255),
                    ip_address VARCHAR(45),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """))
        
        # Create indexes for performance
        await db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token 
            ON refresh_tokens(token)
        """))
        await db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user 
            ON refresh_tokens(user_id)
        """))
        await db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires 
            ON refresh_tokens(expires_at)
        """))
        
        await db.commit()
        logger.info("Migration completed: refresh_tokens table created")

    # Check if library_id column exists in media_items
    has_library_id = await column_exists(db, 'media_items', 'library_id')
    
    if not has_library_id:
        logger.info("Migrating media_items: adding library_id column")
        
        if is_postgres:
            await db.execute(text("""
                ALTER TABLE media_items 
                ADD COLUMN IF NOT EXISTS library_id INTEGER REFERENCES libraries(id)
            """))
        else:
            await db.execute(text("""
                ALTER TABLE media_items 
                ADD COLUMN library_id INTEGER REFERENCES libraries(id)
            """))
        
        # Create index for library_id
        await db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_media_items_library 
            ON media_items(library_id)
        """))
        
        await db.commit()
        logger.info("Migration completed: library_id column added to media_items")

    # Check if staging columns exist in libraries table
    has_library_staging = await column_exists(db, 'libraries', 'staging_enabled')
    
    if not has_library_staging:
        logger.info("Migrating libraries: adding per-library staging columns")
        
        if is_postgres:
            await db.execute(text("ALTER TABLE libraries ADD COLUMN IF NOT EXISTS staging_enabled BOOLEAN DEFAULT NULL"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN IF NOT EXISTS staging_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN IF NOT EXISTS staging_grace_period_days INTEGER"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN IF NOT EXISTS staging_auto_restore BOOLEAN DEFAULT NULL"))
        else:
            await db.execute(text("ALTER TABLE libraries ADD COLUMN staging_enabled BOOLEAN DEFAULT NULL"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN staging_path VARCHAR(500)"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN staging_grace_period_days INTEGER"))
            await db.execute(text("ALTER TABLE libraries ADD COLUMN staging_auto_restore BOOLEAN DEFAULT NULL"))
        
        await db.commit()
        logger.info("Migration completed: per-library staging columns added")

    # Check if event_types column exists in notification_channels
    has_event_types = await column_exists(db, 'notification_channels', 'event_types')
    
    if not has_event_types:
        logger.info("Migrating notification_channels: adding event_types column")
        
        if is_postgres:
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS event_types TEXT"))
        else:
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN event_types TEXT"))
        
        await db.commit()
        logger.info("Migration completed: event_types column added to notification_channels")

    # Check if title_template column exists in notification_channels
    has_title_template = await column_exists(db, 'notification_channels', 'title_template')
    
    if not has_title_template:
        logger.info("Migrating notification_channels: adding template and retry columns")
        
        if is_postgres:
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS title_template VARCHAR(500)"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS message_template TEXT"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS retry_backoff_base INTEGER DEFAULT 2"))
        else:
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN title_template VARCHAR(500)"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN message_template TEXT"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN max_retries INTEGER DEFAULT 3"))
            await db.execute(text("ALTER TABLE notification_channels ADD COLUMN retry_backoff_base INTEGER DEFAULT 2"))
        
        await db.commit()
        logger.info("Migration completed: template and retry columns added to notification_channels")

    # Check if staging_library_name column exists in libraries table
    has_staging_library_name = await column_exists(db, 'libraries', 'staging_library_name')
    
    if not has_staging_library_name:
        logger.info("Migrating libraries: adding staging_library_name column")
        
        if is_postgres:
            await db.execute(text("ALTER TABLE libraries ADD COLUMN IF NOT EXISTS staging_library_name VARCHAR(200)"))
        else:
            await db.execute(text("ALTER TABLE libraries ADD COLUMN staging_library_name VARCHAR(200)"))
        
        await db.commit()
        logger.info("Migration completed: staging_library_name column added to libraries")
    # Migrate position_ticks and runtime_ticks from INTEGER to BIGINT
    # Emby tick values can exceed int32 range (max ~2.1B), e.g. 70223183889
    has_playback_table = await table_exists(db, 'playback_activities')
    if has_playback_table:
        needs_bigint_migration = False
        if is_postgres:
            # Check if columns are still integer (not bigint)
            result = await db.execute(text("""
                SELECT data_type FROM information_schema.columns 
                WHERE table_name = 'playback_activities' AND column_name = 'position_ticks'
            """))
            row = result.scalar()
            if row and row == 'integer':
                needs_bigint_migration = True
        # SQLite has no strict integer size, so no migration needed there

        if needs_bigint_migration:
            logger.info("Migrating playback_activities: position_ticks and runtime_ticks INTEGER → BIGINT")
            await db.execute(text("ALTER TABLE playback_activities ALTER COLUMN position_ticks TYPE BIGINT"))
            await db.execute(text("ALTER TABLE playback_activities ALTER COLUMN runtime_ticks TYPE BIGINT"))
            await db.commit()
            logger.info("Migration completed: playback_activities tick columns are now BIGINT")