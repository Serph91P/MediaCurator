"""
Cleanup engine - evaluates rules and performs cleanup actions.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime as dt, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from loguru import logger
import os
import shutil

from ..models import (
    MediaItem, CleanupRule, ServiceConnection, CleanupLog,
    NotificationChannel, MediaType, RuleActionType, ServiceType
)
from ..schemas import RuleConditions
from .sonarr import SonarrClient
from .radarr import RadarrClient
from .emby import EmbyClient
from .notifications import NotificationService, NotificationColors, create_cleanup_notification_message


class CleanupEngine:
    """Engine for evaluating and executing cleanup rules."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.notification_service = NotificationService()
    
    async def get_disk_space(self, path: str) -> Dict[str, Any]:
        """Get disk space information for a path."""
        try:
            stat = os.statvfs(path)
            total = stat.f_blocks * stat.f_frsize
            free = stat.f_bavail * stat.f_frsize
            used = total - free
            return {
                "path": path,
                "total_bytes": total,
                "used_bytes": used,
                "free_bytes": free,
                "used_percent": (used / total) * 100 if total > 0 else 0
            }
        except Exception as e:
            logger.error(f"Failed to get disk space for {path}: {e}")
            return {
                "path": path,
                "total_bytes": 0,
                "used_bytes": 0,
                "free_bytes": 0,
                "used_percent": 0
            }
    
    async def evaluate_rule(
        self,
        rule: CleanupRule,
        items: List[MediaItem],
        disk_info: Optional[Dict[str, Any]] = None
    ) -> List[MediaItem]:
        """Evaluate a rule against media items and return items that match."""
        conditions = RuleConditions(**rule.conditions) if isinstance(rule.conditions, dict) else rule.conditions
        matched_items = []
        
        # Check disk space threshold
        if conditions.disk_space_threshold_percent and disk_info:
            if disk_info["used_percent"] < conditions.disk_space_threshold_percent:
                logger.debug(f"Disk usage {disk_info['used_percent']:.1f}% below threshold {conditions.disk_space_threshold_percent}%")
                return []
        
        for item in items:
            # Skip if item's media type is not in rule's target media types
            if item.media_type not in rule.media_types:
                continue
            
            # Skip items watched recently (within last X days)
            if conditions.exclude_watched_within_days is not None:
                if item.last_watched:
                    cutoff_date = dt.now(timezone.utc) - timedelta(days=conditions.exclude_watched_within_days)
                    if item.last_watched >= cutoff_date:
                        logger.debug(f"Skipping {item.title} - watched within last {conditions.exclude_watched_within_days} days")
                        continue
            
            # Check watched progress threshold
            if conditions.watched_progress_below is not None:
                if item.progress_percent and item.progress_percent >= conditions.watched_progress_below:
                    continue
            
            # Skip favorited items
            if conditions.exclude_favorited and item.is_favorited:
                continue
            
            # Skip recently added items
            if conditions.exclude_recently_added_days and item.added_at:
                days_since_added = (dt.now(timezone.utc) - item.added_at).days
                if days_since_added < conditions.exclude_recently_added_days:
                    continue
            
            # Check not watched days
            if conditions.not_watched_days:
                if item.last_watched_at:
                    days_since_watched = (dt.now(timezone.utc) - item.last_watched_at).days
                    if days_since_watched < conditions.not_watched_days:
                        continue
                elif item.added_at:
                    # Never watched - use added date
                    days_since_added = (dt.now(timezone.utc) - item.added_at).days
                    if days_since_added < conditions.not_watched_days:
                        continue
            
            # Check minimum age
            if conditions.min_age_days and item.added_at:
                days_since_added = (dt.now(timezone.utc) - item.added_at).days
                if days_since_added < conditions.min_age_days:
                    continue
            
            # Check excluded genres
            if conditions.exclude_genres:
                item_genres = item.genres or []
                if any(g in item_genres for g in conditions.exclude_genres):
                    continue
            
            # Check excluded tags
            if conditions.exclude_tags:
                item_tags = item.tags or []
                if any(t in item_tags for t in conditions.exclude_tags):
                    continue
            
            # Check include tags (if specified, item must have at least one)
            if conditions.include_tags:
                item_tags = item.tags or []
                if not any(t in item_tags for t in conditions.include_tags):
                    continue
            
            # Check rating threshold
            if conditions.rating_below and item.rating:
                if item.rating >= conditions.rating_below:
                    continue
            
            matched_items.append(item)
        
        # Apply max items limit
        if conditions.max_items_per_run and len(matched_items) > conditions.max_items_per_run:
            # Sort by oldest last watched
            matched_items.sort(key=lambda x: x.last_watched_at or dt.min)
            matched_items = matched_items[:conditions.max_items_per_run]
        
        return matched_items
    
    async def flag_items(
        self,
        items: List[MediaItem],
        rule: CleanupRule
    ) -> int:
        """Flag items for cleanup with grace period."""
        flagged_count = 0
        now = dt.now(timezone.utc)
        scheduled_at = now + timedelta(days=rule.grace_period_days)
        
        for item in items:
            if not item.flagged_for_cleanup:
                item.flagged_for_cleanup = True
                item.flagged_at = now
                item.flagged_by_rule_id = rule.id
                item.scheduled_cleanup_at = scheduled_at
                flagged_count += 1
        
        if flagged_count > 0:
            await self.db.commit()
            logger.info(f"Flagged {flagged_count} items for cleanup (rule: {rule.name})")
        
        return flagged_count
    
    async def execute_cleanup(
        self,
        item: MediaItem,
        rule: CleanupRule,
        service_connection: ServiceConnection
    ) -> bool:
        """Execute cleanup action on a media item."""
        try:
            action = rule.action
            
            # Get appropriate client
            if service_connection.service_type == ServiceType.SONARR:
                client = SonarrClient(
                    url=service_connection.url,
                    api_key=service_connection.api_key,
                    verify_ssl=service_connection.verify_ssl,
                    timeout=service_connection.timeout
                )
            elif service_connection.service_type == ServiceType.RADARR:
                client = RadarrClient(
                    url=service_connection.url,
                    api_key=service_connection.api_key,
                    verify_ssl=service_connection.verify_ssl,
                    timeout=service_connection.timeout
                )
            else:
                logger.error(f"Unsupported service type for deletion: {service_connection.service_type}")
                return False
            
            try:
                # Parse conditions for add_import_exclusion option
                conditions = RuleConditions(**rule.conditions) if isinstance(rule.conditions, dict) else rule.conditions
                add_exclusion = getattr(conditions, 'add_import_exclusion', True)
                
                if action == RuleActionType.DELETE:
                    if service_connection.service_type == ServiceType.RADARR:
                        await client.delete_movie(int(item.external_id), delete_files=True, add_exclusion=add_exclusion)
                    elif service_connection.service_type == ServiceType.SONARR:
                        if item.media_type == MediaType.EPISODE:
                            await client.delete_episode_file(int(item.external_id))
                        else:
                            await client.delete_series(int(item.external_id), delete_files=True)
                            # Add to import exclusion manually for Sonarr
                            if add_exclusion and item.series_id:
                                try:
                                    # Get TVDB ID from series data if available
                                    series = await client.get_series_by_id(int(item.external_id))
                                    tvdb_id = series.get("tvdbId")
                                    if tvdb_id:
                                        await client.add_import_list_exclusion(tvdb_id, item.title)
                                except Exception as e:
                                    logger.warning(f"Failed to add import exclusion for {item.title}: {e}")
                
                elif action == RuleActionType.DELETE_AND_UNMONITOR:
                    # Delete files but keep the series/movie in arr as unmonitored
                    if service_connection.service_type == ServiceType.RADARR:
                        # First unmonitor, then delete files only (not the movie entry)
                        await client.unmonitor_movie(int(item.external_id))
                        # Delete the movie file but keep the movie entry
                        await client.delete_movie(int(item.external_id), delete_files=True, add_exclusion=False)
                    elif service_connection.service_type == ServiceType.SONARR:
                        if item.media_type == MediaType.EPISODE:
                            # Unmonitor the episode then delete the file
                            await client.unmonitor_episode(int(item.external_id))
                            await client.delete_episode_file(int(item.external_id))
                        else:
                            # For series: unmonitor and delete files, but keep series entry
                            await client.unmonitor_series(int(item.external_id))
                            await client.delete_series(int(item.external_id), delete_files=True)
                
                elif action == RuleActionType.UNMONITOR:
                    if service_connection.service_type == ServiceType.RADARR:
                        await client.unmonitor_movie(int(item.external_id))
                    elif service_connection.service_type == ServiceType.SONARR:
                        if item.media_type == MediaType.EPISODE:
                            await client.unmonitor_episode(int(item.external_id))
                        else:
                            await client.unmonitor_series(int(item.external_id))
                
                elif action == RuleActionType.NOTIFY_ONLY:
                    # Just log, no actual deletion
                    pass
                
                # Log the action
                log_entry = CleanupLog(
                    media_item_id=item.id,
                    rule_id=rule.id,
                    action=action.value,
                    status="success",
                    details={"service": service_connection.name},
                    media_title=item.title,
                    media_path=item.path,
                    media_size_bytes=item.size_bytes
                )
                self.db.add(log_entry)
                
                # Update item status
                if action in (RuleActionType.DELETE, RuleActionType.DELETE_AND_UNMONITOR):
                    await self.db.delete(item)
                else:
                    item.flagged_for_cleanup = False
                    item.flagged_at = None
                    item.scheduled_cleanup_at = None
                
                await self.db.commit()
                return True
                
            finally:
                await client.close()
        
        except Exception as e:
            logger.error(f"Failed to execute cleanup for {item.title}: {e}")
            
            # Log failure
            log_entry = CleanupLog(
                media_item_id=item.id,
                rule_id=rule.id,
                action=rule.action.value,
                status="failed",
                error_message=str(e),
                media_title=item.title,
                media_path=item.path,
                media_size_bytes=item.size_bytes
            )
            self.db.add(log_entry)
            await self.db.commit()
            
            return False
    
    async def run_scheduled_cleanups(self) -> Dict[str, Any]:
        """Run scheduled cleanups for flagged items past their grace period."""
        now = dt.now(timezone.utc)
        
        # Get items due for cleanup
        result = await self.db.execute(
            select(MediaItem).where(
                and_(
                    MediaItem.flagged_for_cleanup == True,
                    MediaItem.scheduled_cleanup_at <= now
                )
            )
        )
        items = result.scalars().all()
        
        if not items:
            return {"processed": 0, "success": 0, "failed": 0}
        
        logger.info(f"Processing {len(items)} items due for cleanup")
        
        success_count = 0
        failed_count = 0
        deleted_items = []
        
        for item in items:
            # Get rule and service connection
            rule_result = await self.db.execute(
                select(CleanupRule).where(CleanupRule.id == item.flagged_by_rule_id)
            )
            rule = rule_result.scalar_one_or_none()
            
            service_result = await self.db.execute(
                select(ServiceConnection).where(ServiceConnection.id == item.service_connection_id)
            )
            service = service_result.scalar_one_or_none()
            
            if rule and service:
                success = await self.execute_cleanup(item, rule, service)
                if success:
                    success_count += 1
                    deleted_items.append({
                        "title": item.title,
                        "size_bytes": item.size_bytes
                    })
                else:
                    failed_count += 1
            else:
                logger.warning(f"Missing rule or service for item {item.id}")
                failed_count += 1
        
        # Send notifications
        if deleted_items:
            await self._send_cleanup_notifications(deleted_items, "delete")
        
        return {
            "processed": len(items),
            "success": success_count,
            "failed": failed_count
        }
    
    async def _send_cleanup_notifications(
        self,
        items: List[Dict[str, Any]],
        action: str,
        rule_name: Optional[str] = None
    ):
        """Send notifications about cleanup actions."""
        # Get enabled notification channels
        result = await self.db.execute(
            select(NotificationChannel).where(
                and_(
                    NotificationChannel.is_enabled == True,
                    NotificationChannel.notify_on_deleted == True if action == "delete" else NotificationChannel.notify_on_flagged == True
                )
            )
        )
        channels = result.scalars().all()
        
        if not channels:
            return
        
        title, message = create_cleanup_notification_message(items, action, rule_name)
        color = NotificationColors.DELETION if action == "delete" else NotificationColors.WARNING
        
        for channel in channels:
            await self.notification_service.send(
                notification_type=channel.notification_type,
                config=channel.config,
                title=title,
                message=message,
                color=color
            )
    
    async def preview_cleanup(self, rule_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Preview what would be cleaned up without actually doing it.
        Returns detailed information about each item and why it would/wouldn't be deleted.
        """
        preview_results = []
        
        # Get rules to evaluate
        if rule_id:
            rule_result = await self.db.execute(
                select(CleanupRule).where(CleanupRule.id == rule_id)
            )
            rules = [rule_result.scalar_one_or_none()]
            if not rules[0]:
                return {"error": "Rule not found", "items": []}
        else:
            rule_result = await self.db.execute(
                select(CleanupRule).where(CleanupRule.is_enabled == True).order_by(CleanupRule.priority.desc())
            )
            rules = rule_result.scalars().all()
        
        # Get all media items
        items_result = await self.db.execute(select(MediaItem))
        all_items = items_result.scalars().all()
        
        # Track which items have been processed
        processed_item_ids = set()
        
        for rule in rules:
            if not rule:
                continue
                
            conditions = RuleConditions(**rule.conditions) if isinstance(rule.conditions, dict) else rule.conditions
            
            # Get disk info if needed
            disk_info = None
            if conditions.disk_space_threshold_percent:
                # Try to get disk info from library path or default media path
                disk_info = await self.get_disk_space("/media")
            
            # Filter items for this rule's media types
            rule_items = [i for i in all_items if i.media_type in rule.media_types and i.id not in processed_item_ids]
            
            for item in rule_items:
                evaluation = await self._evaluate_item_for_preview(item, rule, conditions, disk_info, all_items)
                evaluation["rule_name"] = rule.name
                evaluation["rule_id"] = rule.id
                
                # Skip items with no local files (0 bytes) - nothing to delete
                if evaluation["size_bytes"] == 0:
                    continue
                
                preview_results.append(evaluation)
                
                if evaluation["would_delete"]:
                    processed_item_ids.add(item.id)
        
        # Summary stats
        would_delete = [r for r in preview_results if r["would_delete"]]
        would_skip = [r for r in preview_results if not r["would_delete"]]
        total_size = sum(r["size_bytes"] or 0 for r in would_delete)
        
        return {
            "summary": {
                "total_evaluated": len(preview_results),
                "would_delete": len(would_delete),
                "would_skip": len(would_skip),
                "total_size_bytes": total_size,
                "rules_evaluated": len(rules)
            },
            "items": preview_results
        }
    
    async def _evaluate_item_for_preview(
        self,
        item: MediaItem,
        rule: CleanupRule,
        conditions: RuleConditions,
        disk_info: Optional[Dict[str, Any]],
        all_items: Optional[list] = None
    ) -> Dict[str, Any]:
        """Evaluate a single item and return detailed reasoning."""
        # For series items, calculate total size from all episodes
        size_bytes = item.size_bytes or 0
        season_count = 0
        episode_count = 0
        
        if item.media_type == MediaType.SERIES and all_items:
            # Find all episodes of this series and sum their sizes
            episodes = [i for i in all_items if i.media_type == MediaType.EPISODE and i.series_id == item.external_id]
            if episodes:
                size_bytes = sum(ep.size_bytes or 0 for ep in episodes)
                seasons = set(ep.season_number for ep in episodes if ep.season_number is not None)
                season_count = len(seasons)
                episode_count = len(episodes)
        
        result = {
            "item_id": item.id,
            "title": item.title,
            "media_type": item.media_type.value if hasattr(item.media_type, 'value') else str(item.media_type),
            "path": item.path,
            "size_bytes": size_bytes,
            "season_count": season_count,
            "episode_count": episode_count,
            "would_delete": True,
            "action": rule.action.value if hasattr(rule.action, 'value') else str(rule.action),
            "reasons": [],
            "skip_reasons": [],
            "item_details": {
                "is_watched": item.is_watched,
                "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
                "watch_count": item.watch_count,
                "progress_percent": item.progress_percent,
                "is_currently_watching": getattr(item, 'is_currently_watching', False),
                "is_favorited": item.is_favorited,
                "added_at": item.added_at.isoformat() if item.added_at else None,
                "genres": item.genres or [],
                "tags": item.tags or [],
                "rating": item.rating,
                "flagged_for_cleanup": item.flagged_for_cleanup,
                "scheduled_cleanup_at": item.scheduled_cleanup_at.isoformat() if item.scheduled_cleanup_at else None
            }
        }
        
        # Check disk space threshold
        if conditions.disk_space_threshold_percent and disk_info:
            if disk_info["used_percent"] < conditions.disk_space_threshold_percent:
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Disk usage ({disk_info['used_percent']:.1f}%) below threshold ({conditions.disk_space_threshold_percent}%)"
                )
                return result
            else:
                result["reasons"].append(
                    f"Disk usage ({disk_info['used_percent']:.1f}%) exceeds threshold ({conditions.disk_space_threshold_percent}%)"
                )
        
        # Check if watched recently (within last X days)
        if conditions.exclude_watched_within_days is not None:
            if item.last_watched_at:
                cutoff_date = dt.now(timezone.utc) - timedelta(days=conditions.exclude_watched_within_days)
                if item.last_watched_at >= cutoff_date:
                    result["would_delete"] = False
                    result["skip_reasons"].append(
                        f"Watched within last {conditions.exclude_watched_within_days} days (last watched: {item.last_watched_at.strftime('%Y-%m-%d')})"
                    )
                    return result
        
        # Check watched progress threshold
        if conditions.watched_progress_below is not None:
            if item.progress_percent and item.progress_percent >= conditions.watched_progress_below:
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Progress ({item.progress_percent:.0f}%) above threshold ({conditions.watched_progress_below}%)"
                )
                return result
        
        # Check favorited
        if conditions.exclude_favorited and item.is_favorited:
            result["would_delete"] = False
            result["skip_reasons"].append("Item is favorited")
            return result
        
        # Check recently added
        if getattr(conditions, 'exclude_recently_added_days', None) and item.added_at:
            days_since_added = (dt.now(timezone.utc) - item.added_at).days
            if days_since_added < conditions.exclude_recently_added_days:
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Recently added ({days_since_added} days ago, threshold: {conditions.exclude_recently_added_days} days)"
                )
                return result
        
        # Check not watched days
        if conditions.not_watched_days:
            if item.last_watched_at:
                days_since_watched = (dt.now(timezone.utc) - item.last_watched_at).days
                if days_since_watched < conditions.not_watched_days:
                    result["would_delete"] = False
                    result["skip_reasons"].append(
                        f"Watched {days_since_watched} days ago (threshold: {conditions.not_watched_days} days)"
                    )
                    return result
                else:
                    result["reasons"].append(
                        f"Not watched for {days_since_watched} days (threshold: {conditions.not_watched_days} days)"
                    )
            elif item.added_at:
                days_since_added = (dt.now(timezone.utc) - item.added_at).days
                if days_since_added < conditions.not_watched_days:
                    result["would_delete"] = False
                    result["skip_reasons"].append(
                        f"Never watched, added {days_since_added} days ago (threshold: {conditions.not_watched_days} days)"
                    )
                    return result
                else:
                    result["reasons"].append(
                        f"Never watched, added {days_since_added} days ago"
                    )
        
        # Check minimum age
        if conditions.min_age_days and item.added_at:
            days_since_added = (dt.now(timezone.utc) - item.added_at).days
            if days_since_added < conditions.min_age_days:
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Too new ({days_since_added} days old, minimum: {conditions.min_age_days} days)"
                )
                return result
        
        # Check excluded genres
        if conditions.exclude_genres:
            item_genres = item.genres or []
            matching_genres = [g for g in conditions.exclude_genres if g in item_genres]
            if matching_genres:
                result["would_delete"] = False
                result["skip_reasons"].append(f"Has excluded genre(s): {', '.join(matching_genres)}")
                return result
        
        # Check excluded tags
        if conditions.exclude_tags:
            item_tags = item.tags or []
            matching_tags = [t for t in conditions.exclude_tags if t in item_tags]
            if matching_tags:
                result["would_delete"] = False
                result["skip_reasons"].append(f"Has excluded tag(s): {', '.join(matching_tags)}")
                return result
        
        # Check include tags
        if conditions.include_tags:
            item_tags = item.tags or []
            if not any(t in item_tags for t in conditions.include_tags):
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Missing required tag(s): {', '.join(conditions.include_tags)}"
                )
                return result
        
        # Check rating threshold
        if conditions.rating_below and item.rating:
            if item.rating >= conditions.rating_below:
                result["would_delete"] = False
                result["skip_reasons"].append(
                    f"Rating ({item.rating}) above threshold ({conditions.rating_below})"
                )
                return result
            else:
                result["reasons"].append(
                    f"Rating ({item.rating}) below threshold ({conditions.rating_below})"
                )
        
        # If we got here, item matches all conditions
        if not result["reasons"]:
            result["reasons"].append("Matches all rule conditions")
        
        return result
