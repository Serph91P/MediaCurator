"""
Database migrations for schema changes.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from loguru import logger


async def migrate_database(db: AsyncSession):
    """Run all necessary database migrations."""
    
    # Check if old media_type column exists (needs migration)
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('cleanup_rules') 
        WHERE name='media_type'
    """))
    has_old_media_type = result.scalar() > 0
    
    if has_old_media_type:
        logger.info("Migrating cleanup_rules: removing old media_type column and adding media_types")
        
        # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        # Step 1: Create new table with correct schema
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
        
        # Step 2: Copy data from old table, converting media_type to media_types
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
        
        # Step 3: Drop old table
        await db.execute(text("DROP TABLE cleanup_rules"))
        
        # Step 4: Rename new table
        await db.execute(text("ALTER TABLE cleanup_rules_new RENAME TO cleanup_rules"))
        
        await db.commit()
        logger.info("Migration completed: media_type column removed, media_types added")
    
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
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM sqlite_master 
        WHERE type='table' AND name='refresh_tokens'
    """))
    has_refresh_tokens = result.scalar() > 0
    
    if not has_refresh_tokens:
        logger.info("Creating refresh_tokens table for session management")
        
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
            CREATE INDEX idx_refresh_tokens_token 
            ON refresh_tokens(token)
        """))
        await db.execute(text("""
            CREATE INDEX idx_refresh_tokens_user 
            ON refresh_tokens(user_id)
        """))
        await db.execute(text("""
            CREATE INDEX idx_refresh_tokens_expires 
            ON refresh_tokens(expires_at)
        """))
        
        await db.commit()
        logger.info("Migration completed: refresh_tokens table created")

    # Check if library_id column exists in media_items
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('media_items') 
        WHERE name='library_id'
    """))
    has_library_id = result.scalar() > 0
    
    if not has_library_id:
        logger.info("Migrating media_items: adding library_id column")
        
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
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('libraries') 
        WHERE name='staging_enabled'
    """))
    has_library_staging = result.scalar() > 0
    
    if not has_library_staging:
        logger.info("Migrating libraries: adding per-library staging columns")
        
        await db.execute(text("""
            ALTER TABLE libraries 
            ADD COLUMN staging_enabled BOOLEAN DEFAULT NULL
        """))
        await db.execute(text("""
            ALTER TABLE libraries 
            ADD COLUMN staging_path VARCHAR(500)
        """))
        await db.execute(text("""
            ALTER TABLE libraries 
            ADD COLUMN staging_grace_period_days INTEGER
        """))
        await db.execute(text("""
            ALTER TABLE libraries 
            ADD COLUMN staging_auto_restore BOOLEAN DEFAULT NULL
        """))
        
        await db.commit()
        logger.info("Migration completed: per-library staging columns added")

    # Check if event_types column exists in notification_channels
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('notification_channels') 
        WHERE name='event_types'
    """))
    has_event_types = result.scalar() > 0
    
    if not has_event_types:
        logger.info("Migrating notification_channels: adding event_types column")
        
        await db.execute(text("""
            ALTER TABLE notification_channels 
            ADD COLUMN event_types TEXT
        """))
        
        await db.commit()
        logger.info("Migration completed: event_types column added to notification_channels")

    # Check if title_template column exists in notification_channels
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('notification_channels') 
        WHERE name='title_template'
    """))
    has_title_template = result.scalar() > 0
    
    if not has_title_template:
        logger.info("Migrating notification_channels: adding template and retry columns")
        
        await db.execute(text("""
            ALTER TABLE notification_channels 
            ADD COLUMN title_template VARCHAR(500)
        """))
        await db.execute(text("""
            ALTER TABLE notification_channels 
            ADD COLUMN message_template TEXT
        """))
        await db.execute(text("""
            ALTER TABLE notification_channels 
            ADD COLUMN max_retries INTEGER DEFAULT 3
        """))
        await db.execute(text("""
            ALTER TABLE notification_channels 
            ADD COLUMN retry_backoff_base INTEGER DEFAULT 2
        """))
        
        await db.commit()
        logger.info("Migration completed: template and retry columns added to notification_channels")

    # Check if staging_library_name column exists in libraries table
    result = await db.execute(text("""
        SELECT COUNT(*) as count 
        FROM pragma_table_info('libraries') 
        WHERE name='staging_library_name'
    """))
    has_staging_library_name = result.scalar() > 0
    
    if not has_staging_library_name:
        logger.info("Migrating libraries: adding staging_library_name column")
        
        await db.execute(text("""
            ALTER TABLE libraries 
            ADD COLUMN staging_library_name VARCHAR(200)
        """))
        
        await db.commit()
        logger.info("Migration completed: staging_library_name column added to libraries")
