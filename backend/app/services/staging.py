"""
Staging service for soft-delete functionality.

Moves media files to staging directory where users can still watch them
in a dedicated Emby library before permanent deletion.
"""
import os
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models import MediaItem, CleanupLog, SystemSettings
from .emby import EmbyService
from loguru import logger


class StagingService:
    """Service for managing staged media files."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_settings(self) -> Dict[str, Any]:
        """Get staging configuration from system settings."""
        settings = {
            "enabled": False,
            "staging_path": "/media/staging",
            "grace_period_days": 7,
            "library_name": "MediaCleanup - Scheduled for Deletion",
            "auto_restore_on_watch": True
        }
        
        # Load from database
        result = await self.db.execute(
            select(SystemSettings).where(SystemSettings.key.in_([
                'staging_enabled',
                'staging_path',
                'staging_grace_period_days',
                'staging_library_name',
                'staging_auto_restore'
            ]))
        )
        
        for setting in result.scalars().all():
            if setting.key == 'staging_enabled':
                settings['enabled'] = setting.value
            elif setting.key == 'staging_path':
                settings['staging_path'] = setting.value
            elif setting.key == 'staging_grace_period_days':
                settings['grace_period_days'] = setting.value
            elif setting.key == 'staging_library_name':
                settings['library_name'] = setting.value
            elif setting.key == 'staging_auto_restore':
                settings['auto_restore_on_watch'] = setting.value
        
        return settings
    
    async def ensure_staging_directory(self, staging_path: str) -> bool:
        """Ensure staging directory exists and is writable."""
        try:
            path = Path(staging_path)
            path.mkdir(parents=True, exist_ok=True)
            
            # Test write permissions
            test_file = path / ".write_test"
            test_file.touch()
            test_file.unlink()
            
            return True
        except Exception as e:
            logger.error(f"Failed to ensure staging directory: {e}")
            return False
    
    async def move_to_staging(
        self, 
        media_item: MediaItem, 
        emby_service: Optional[EmbyService] = None
    ) -> Dict[str, Any]:
        """
        Move media file to staging directory.
        
        Args:
            media_item: MediaItem to stage
            emby_service: Optional EmbyService for library management
            
        Returns:
            Dict with success status and details
        """
        settings = await self.get_settings()
        
        if not settings['enabled']:
            return {"success": False, "error": "Staging is not enabled"}
        
        if not media_item.path:
            return {"success": False, "error": "Media item has no path"}
        
        if media_item.is_staged:
            return {"success": False, "error": "Media item is already staged"}
        
        try:
            # Ensure staging directory exists
            if not await self.ensure_staging_directory(settings['staging_path']):
                return {"success": False, "error": "Failed to create staging directory"}
            
            original_path = Path(media_item.path)
            if not original_path.exists():
                return {"success": False, "error": f"Original file not found: {media_item.path}"}
            
            # Determine staging path structure
            # Preserve directory structure for series: staging/SeriesName/Season X/episode.mkv
            # For movies: staging/MovieName (year)/movie.mkv
            if media_item.media_type.value == "episode" and media_item.series_id:
                # Get series name from parent directory
                series_dir = original_path.parent.parent.name if media_item.season_number else original_path.parent.name
                season_dir = original_path.parent.name if media_item.season_number else ""
                
                staging_subdir = Path(settings['staging_path']) / series_dir
                if season_dir:
                    staging_subdir = staging_subdir / season_dir
            else:
                # Movie or series root
                staging_subdir = Path(settings['staging_path']) / original_path.parent.name
            
            staging_subdir.mkdir(parents=True, exist_ok=True)
            staged_path = staging_subdir / original_path.name
            
            # Move file
            logger.info(f"Moving {original_path} to {staged_path}")
            shutil.move(str(original_path), str(staged_path))
            
            # Update media item
            media_item.is_staged = True
            media_item.staged_at = datetime.utcnow()
            media_item.original_path = str(original_path)
            media_item.staged_path = str(staged_path)
            media_item.path = str(staged_path)  # Update current path
            media_item.permanent_delete_at = datetime.utcnow() + timedelta(days=settings['grace_period_days'])
            
            # If Emby service provided, update libraries
            if emby_service:
                # Remove from original library (trigger Emby scan)
                # Add to staging library (will be created if not exists)
                staging_library_id = await emby_service.ensure_staging_library(
                    settings['library_name'],
                    settings['staging_path']
                )
                media_item.staged_library_id = staging_library_id
            
            await self.db.commit()
            
            # Log the action
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="staged",
                status="success",
                details={
                    "original_path": str(original_path),
                    "staged_path": str(staged_path),
                    "grace_period_days": settings['grace_period_days'],
                    "permanent_delete_at": media_item.permanent_delete_at.isoformat()
                },
                media_title=media_item.title,
                media_path=str(staged_path),
                media_size_bytes=media_item.size_bytes
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            logger.info(f"Successfully staged media item {media_item.id}: {media_item.title}")
            
            return {
                "success": True,
                "staged_path": str(staged_path),
                "permanent_delete_at": media_item.permanent_delete_at.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to stage media item {media_item.id}: {e}")
            await self.db.rollback()
            
            # Log the failure
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="staged",
                status="failed",
                error_message=str(e),
                media_title=media_item.title,
                media_path=media_item.path
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            return {"success": False, "error": str(e)}
    
    async def restore_from_staging(
        self, 
        media_item: MediaItem,
        emby_service: Optional[EmbyService] = None
    ) -> Dict[str, Any]:
        """
        Restore media file from staging to original location.
        
        Args:
            media_item: MediaItem to restore
            emby_service: Optional EmbyService for library management
            
        Returns:
            Dict with success status and details
        """
        if not media_item.is_staged:
            return {"success": False, "error": "Media item is not staged"}
        
        if not media_item.staged_path or not media_item.original_path:
            return {"success": False, "error": "Missing staging or original path"}
        
        try:
            staged_path = Path(media_item.staged_path)
            original_path = Path(media_item.original_path)
            
            if not staged_path.exists():
                return {"success": False, "error": f"Staged file not found: {media_item.staged_path}"}
            
            # Ensure original directory exists
            original_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Move file back
            logger.info(f"Restoring {staged_path} to {original_path}")
            shutil.move(str(staged_path), str(original_path))
            
            # Clean up empty staging directories
            try:
                if staged_path.parent.exists() and not any(staged_path.parent.iterdir()):
                    staged_path.parent.rmdir()
                    # Try parent too (season folder)
                    if staged_path.parent.parent.exists() and not any(staged_path.parent.parent.iterdir()):
                        staged_path.parent.parent.rmdir()
            except:
                pass  # Ignore cleanup errors
            
            # Update media item
            media_item.is_staged = False
            media_item.staged_at = None
            media_item.staged_path = None
            media_item.path = str(original_path)
            media_item.permanent_delete_at = None
            media_item.staged_library_id = None
            media_item.flagged_for_cleanup = False  # Clear flag
            media_item.flagged_at = None
            media_item.flagged_by_rule_id = None
            
            await self.db.commit()
            
            # Log the action
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="restored",
                status="success",
                details={
                    "staged_path": str(staged_path),
                    "restored_to": str(original_path)
                },
                media_title=media_item.title,
                media_path=str(original_path),
                media_size_bytes=media_item.size_bytes
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            logger.info(f"Successfully restored media item {media_item.id}: {media_item.title}")
            
            return {
                "success": True,
                "restored_path": str(original_path)
            }
            
        except Exception as e:
            logger.error(f"Failed to restore media item {media_item.id}: {e}")
            await self.db.rollback()
            
            # Log the failure
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="restored",
                status="failed",
                error_message=str(e),
                media_title=media_item.title
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            return {"success": False, "error": str(e)}
    
    async def permanent_delete(
        self, 
        media_item: MediaItem,
        emby_service: Optional[EmbyService] = None
    ) -> Dict[str, Any]:
        """
        Permanently delete staged media file.
        
        Args:
            media_item: MediaItem to delete
            emby_service: Optional EmbyService for library management
            
        Returns:
            Dict with success status and details
        """
        if not media_item.is_staged:
            return {"success": False, "error": "Media item is not staged"}
        
        if not media_item.staged_path:
            return {"success": False, "error": "Missing staged path"}
        
        try:
            staged_path = Path(media_item.staged_path)
            
            if staged_path.exists():
                logger.info(f"Permanently deleting {staged_path}")
                
                # Delete file
                if staged_path.is_file():
                    staged_path.unlink()
                elif staged_path.is_dir():
                    shutil.rmtree(staged_path)
                
                # Clean up empty directories
                try:
                    parent = staged_path.parent
                    while parent != Path(staged_path.root):
                        if not any(parent.iterdir()):
                            parent.rmdir()
                            parent = parent.parent
                        else:
                            break
                except:
                    pass
            
            # Mark item as deleted in database (keep for history)
            media_item.is_staged = False
            media_item.staged_at = None
            media_item.staged_path = None
            media_item.path = None  # No path anymore
            media_item.permanent_delete_at = None
            
            await self.db.commit()
            
            # Log the action
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="permanent_delete",
                status="success",
                details={
                    "deleted_from": str(staged_path)
                },
                media_title=media_item.title,
                media_path=str(staged_path),
                media_size_bytes=media_item.size_bytes
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            logger.info(f"Successfully permanently deleted media item {media_item.id}: {media_item.title}")
            
            return {"success": True}
            
        except Exception as e:
            logger.error(f"Failed to permanently delete media item {media_item.id}: {e}")
            await self.db.rollback()
            
            # Log the failure
            log_entry = CleanupLog(
                media_item_id=media_item.id,
                action="permanent_delete",
                status="failed",
                error_message=str(e),
                media_title=media_item.title
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            return {"success": False, "error": str(e)}
    
    async def process_expired_staged_items(
        self,
        emby_service: Optional[EmbyService] = None
    ) -> Dict[str, Any]:
        """
        Process staged items that have passed their grace period.
        
        Returns:
            Dict with statistics
        """
        settings = await self.get_settings()
        
        if not settings['enabled']:
            return {"success": False, "error": "Staging is not enabled"}
        
        now = datetime.utcnow()
        
        # Find expired staged items
        from sqlalchemy.orm import joinedload
        result = await self.db.execute(
            select(MediaItem)
            .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
            .where(
                MediaItem.is_staged == True,
                MediaItem.permanent_delete_at <= now
            )
        )
        expired_items = result.scalars().all()
        
        deleted_count = 0
        failed_count = 0
        
        for item in expired_items:
            result = await self.permanent_delete(item, emby_service)
            if result['success']:
                deleted_count += 1
            else:
                failed_count += 1
        
        logger.info(f"Processed {len(expired_items)} expired staged items: {deleted_count} deleted, {failed_count} failed")
        
        return {
            "success": True,
            "processed": len(expired_items),
            "deleted": deleted_count,
            "failed": failed_count
        }
    
    async def check_and_restore_watched(
        self,
        emby_service: EmbyService
    ) -> Dict[str, Any]:
        """
        Check staged items for watch activity and auto-restore if watched.
        
        Args:
            emby_service: EmbyService to check watch status
            
        Returns:
            Dict with statistics
        """
        settings = await self.get_settings()
        
        if not settings['enabled']:
            return {"success": False, "error": "Staging system is not enabled"}
        
        if not settings['auto_restore_on_watch']:
            return {"success": False, "error": "Auto-restore on watch is not enabled"}
        
        # Find all staged items
        result = await self.db.execute(
            select(MediaItem).where(MediaItem.is_staged == True)
        )
        staged_items = result.scalars().all()
        
        restored_count = 0
        
        for item in staged_items:
            # Check if item was watched recently (after staging)
            if item.last_watched_at and item.staged_at:
                if item.last_watched_at > item.staged_at:
                    logger.info(f"Auto-restoring watched item {item.id}: {item.title}")
                    result = await self.restore_from_staging(item, emby_service)
                    if result['success']:
                        restored_count += 1
        
        logger.info(f"Auto-restored {restored_count} watched items from staging")
        
        return {
            "success": True,
            "restored": restored_count
        }
