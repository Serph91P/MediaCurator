"""
Sync service for fetching media items from services.
"""
from typing import Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from loguru import logger

from ..models import ServiceConnection, MediaItem, ServiceType, MediaType, ImportStats
from .sonarr import SonarrClient
from .radarr import RadarrClient
from .emby import EmbyClient


async def sync_service_media(
    db: AsyncSession,
    service: ServiceConnection
) -> Dict[str, Any]:
    """Sync media items from a service connection."""
    logger.info(f"Starting sync for service: {service.name}")
    
    start_time = datetime.now(timezone.utc)
    added = 0
    updated = 0
    errors = []
    
    try:
        if service.service_type == ServiceType.SONARR:
            result = await _sync_sonarr(db, service)
        elif service.service_type == ServiceType.RADARR:
            result = await _sync_radarr(db, service)
        elif service.service_type in [ServiceType.EMBY, ServiceType.JELLYFIN]:
            result = await _sync_emby(db, service)
        else:
            return {
                "success": False,
                "message": f"Unsupported service type: {service.service_type}",
                "added": 0,
                "updated": 0
            }
        
        # Update last sync time
        service.last_sync = datetime.utcnow()
        
        # Create import stats record
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        
        import_stat = ImportStats(
            service_connection_id=service.id,
            items_added=result.get('added', 0),
            items_updated=result.get('updated', 0),
            movies_added=result.get('movies_added', 0),
            series_added=result.get('series_added', 0),
            episodes_added=result.get('episodes_added', 0),
            sync_duration_seconds=duration,
            error_message=result.get('message') if not result.get('success', True) else None
        )
        db.add(import_stat)
        
        await db.commit()
        
        return result
        
    except Exception as e:
        logger.error(f"Sync failed for {service.name}: {e}")
        
        # Log failed sync attempt
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()
        
        import_stat = ImportStats(
            service_connection_id=service.id,
            items_added=0,
            items_updated=0,
            sync_duration_seconds=duration,
            error_message=str(e)
        )
        db.add(import_stat)
        await db.commit()
        
        return {
            "success": False,
            "message": str(e),
            "added": 0,
            "updated": 0
        }


async def _sync_sonarr(
    db: AsyncSession,
    service: ServiceConnection
) -> Dict[str, Any]:
    """Sync series and episodes from Sonarr."""
    client = SonarrClient(
        url=service.url,
        api_key=service.api_key,
        verify_ssl=service.verify_ssl,
        timeout=service.timeout
    )
    
    added = 0
    updated = 0
    series_added = 0
    episodes_added = 0
    
    try:
        series_list = await client.get_series()
        
        for series in series_list:
            # Get or create series item
            result = await db.execute(
                select(MediaItem)
                .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
                .where(
                    MediaItem.external_id == str(series["id"]),
                    MediaItem.service_connection_id == service.id
                )
            )
            item = result.scalar_one_or_none()
            
            series_data = {
                "external_id": str(series["id"]),
                "service_connection_id": service.id,
                "title": series.get("title", "Unknown"),
                "media_type": MediaType.SERIES,
                "year": series.get("year"),
                "path": series.get("path"),
                "size_bytes": series.get("sizeOnDisk", 0),
                "genres": series.get("genres", []),
                "tags": [str(t) for t in series.get("tags", [])],
                "rating": series.get("ratings", {}).get("value"),
                "added_at": datetime.fromisoformat(series["added"].replace("Z", "+00:00")) if series.get("added") else None
            }
            
            if item:
                for key, value in series_data.items():
                    setattr(item, key, value)
                updated += 1
            else:
                item = MediaItem(**series_data)
                db.add(item)
                added += 1
            
            # Sync episodes
            try:
                episodes = await client.get_episodes(series["id"])
                episode_files = await client.get_episode_files(series["id"])
                file_map = {f["id"]: f for f in episode_files}
                
                for episode in episodes:
                    if not episode.get("hasFile"):
                        continue
                    
                    ep_result = await db.execute(
                        select(MediaItem)
                        .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
                        .where(
                            MediaItem.external_id == str(episode["id"]),
                            MediaItem.service_connection_id == service.id,
                            MediaItem.media_type == MediaType.EPISODE
                        )
                    )
                    ep_item = ep_result.scalar_one_or_none()
                    
                    file_info = file_map.get(episode.get("episodeFileId"), {})
                    
                    episode_data = {
                        "external_id": str(episode["id"]),
                        "service_connection_id": service.id,
                        "title": f"{series['title']} - S{episode.get('seasonNumber', 0):02d}E{episode.get('episodeNumber', 0):02d} - {episode.get('title', '')}",
                        "media_type": MediaType.EPISODE,
                        "series_id": str(series["id"]),
                        "season_number": episode.get("seasonNumber"),
                        "episode_number": episode.get("episodeNumber"),
                        "path": file_info.get("path"),
                        "size_bytes": file_info.get("size", 0),
                        "added_at": datetime.fromisoformat(file_info["dateAdded"].replace("Z", "+00:00")) if file_info.get("dateAdded") else None
                    }
                    
                    if ep_item:
                        for key, value in episode_data.items():
                            setattr(ep_item, key, value)
                        updated += 1
                    else:
                        ep_item = MediaItem(**episode_data)
                        db.add(ep_item)
                        added += 1
                        
            except Exception as e:
                logger.warning(f"Failed to sync episodes for series {series['id']}: {e}")
        
        await db.commit()
        
    finally:
        await client.close()
    
    return {
        "success": True,
        "message": f"Synced {added + updated} items",
        "added": added,
        "updated": updated
    }


async def _sync_radarr(
    db: AsyncSession,
    service: ServiceConnection
) -> Dict[str, Any]:
    """Sync movies from Radarr."""
    client = RadarrClient(
        url=service.url,
        api_key=service.api_key,
        verify_ssl=service.verify_ssl,
        timeout=service.timeout
    )
    
    added = 0
    updated = 0
    
    try:
        movies = await client.get_movies()
        
        for movie in movies:
            if not movie.get("hasFile"):
                continue
            
            result = await db.execute(
                select(MediaItem)
                .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
                .where(
                    MediaItem.external_id == str(movie["id"]),
                    MediaItem.service_connection_id == service.id
                )
            )
            item = result.scalar_one_or_none()
            
            movie_data = {
                "external_id": str(movie["id"]),
                "service_connection_id": service.id,
                "title": movie.get("title", "Unknown"),
                "media_type": MediaType.MOVIE,
                "year": movie.get("year"),
                "path": movie.get("path"),
                "size_bytes": movie.get("sizeOnDisk", 0),
                "genres": movie.get("genres", []),
                "tags": [str(t) for t in movie.get("tags", [])],
                "rating": movie.get("ratings", {}).get("value"),
                "added_at": datetime.fromisoformat(movie["added"].replace("Z", "+00:00")) if movie.get("added") else None
            }
            
            if item:
                for key, value in movie_data.items():
                    setattr(item, key, value)
                updated += 1
            else:
                item = MediaItem(**movie_data)
                db.add(item)
                added += 1
        
        await db.commit()
        
    finally:
        await client.close()
    
    return {
        "success": True,
        "message": f"Synced {added + updated} movies",
        "added": added,
        "updated": updated
    }


async def _sync_emby(
    db: AsyncSession,
    service: ServiceConnection
) -> Dict[str, Any]:
    """Sync watch data from Emby/Jellyfin."""
    client = EmbyClient(
        url=service.url,
        api_key=service.api_key,
        verify_ssl=service.verify_ssl,
        timeout=service.timeout
    )
    
    updated = 0
    
    try:
        # Get users - we'll aggregate watch data across all users
        users = await client.get_users()
        
        if not users:
            logger.warning("No users found in Emby")
            return {"success": True, "message": "No users found", "added": 0, "updated": 0}
        
        # Use first admin user or first user for queries
        primary_user = next((u for u in users if u.get("Policy", {}).get("IsAdministrator")), users[0])
        user_id = primary_user["Id"]
        
        # Get active sessions to mark currently watching
        sessions = await client.get_sessions()
        currently_watching_ids = set()
        for session in sessions:
            now_playing = session.get("NowPlayingItem", {})
            if now_playing:
                currently_watching_ids.add(now_playing.get("Id"))
                # Also add parent IDs (series/season)
                if now_playing.get("SeriesId"):
                    currently_watching_ids.add(now_playing.get("SeriesId"))
                if now_playing.get("SeasonId"):
                    currently_watching_ids.add(now_playing.get("SeasonId"))
        
        # Get all media items from our database
        result = await db.execute(
            select(MediaItem)
            .options(joinedload(MediaItem.service_connection), joinedload(MediaItem.library))
        )
        items = result.scalars().all()
        
        # Build path -> item mapping for faster lookup
        path_to_item = {item.path: item for item in items if item.path}
        
        # Get movies with watch data from Emby (efficient single request)
        emby_movies = await client.get_items_with_watch_data(
            user_id=user_id,
            include_item_types=["Movie"]
        )
        
        for emby_item in emby_movies:
            path = emby_item.get("Path")
            if path and path in path_to_item:
                item = path_to_item[path]
                user_data = emby_item.get("UserData", {})
                
                item.is_watched = user_data.get("Played", False)
                item.watch_count = max(item.watch_count or 0, user_data.get("PlayCount", 0))
                item.is_favorited = item.is_favorited or user_data.get("IsFavorite", False)
                item.progress_percent = user_data.get("PlayedPercentage", 0)
                item.is_currently_watching = emby_item.get("Id") in currently_watching_ids
                
                if user_data.get("LastPlayedDate"):
                    last_played = datetime.fromisoformat(
                        user_data["LastPlayedDate"].replace("Z", "+00:00")
                    )
                    if not item.last_watched_at or last_played > item.last_watched_at:
                        item.last_watched_at = last_played
                        item.last_progress_update = datetime.utcnow()
                
                updated += 1
        
        # Get series with watch data
        emby_series = await client.get_items_with_watch_data(
            user_id=user_id,
            include_item_types=["Series"]
        )
        
        for emby_item in emby_series:
            path = emby_item.get("Path")
            if path and path in path_to_item:
                item = path_to_item[path]
                user_data = emby_item.get("UserData", {})
                
                item.is_watched = user_data.get("Played", False)
                item.watch_count = max(item.watch_count or 0, user_data.get("PlayCount", 0))
                item.is_favorited = item.is_favorited or user_data.get("IsFavorite", False)
                item.progress_percent = user_data.get("PlayedPercentage", 0)
                item.is_currently_watching = emby_item.get("Id") in currently_watching_ids
                
                if user_data.get("LastPlayedDate"):
                    last_played = datetime.fromisoformat(
                        user_data["LastPlayedDate"].replace("Z", "+00:00")
                    )
                    if not item.last_watched_at or last_played > item.last_watched_at:
                        item.last_watched_at = last_played
                        item.last_progress_update = datetime.utcnow()
                
                updated += 1
        
        # Get episodes with watch data (can be many, so we batch)
        emby_episodes = await client.get_items_with_watch_data(
            user_id=user_id,
            include_item_types=["Episode"]
        )
        
        for emby_item in emby_episodes:
            path = emby_item.get("Path")
            if path and path in path_to_item:
                item = path_to_item[path]
                user_data = emby_item.get("UserData", {})
                
                item.is_watched = user_data.get("Played", False)
                item.watch_count = max(item.watch_count or 0, user_data.get("PlayCount", 0))
                item.is_favorited = item.is_favorited or user_data.get("IsFavorite", False)
                item.progress_percent = user_data.get("PlayedPercentage", 0)
                item.is_currently_watching = emby_item.get("Id") in currently_watching_ids
                
                if user_data.get("LastPlayedDate"):
                    last_played = datetime.fromisoformat(
                        user_data["LastPlayedDate"].replace("Z", "+00:00")
                    )
                    if not item.last_watched_at or last_played > item.last_watched_at:
                        item.last_watched_at = last_played
                        item.last_progress_update = datetime.utcnow()
                
                updated += 1
        
        # Also check watch data from other users for completeness
        for user in users[1:]:  # Skip primary user, already processed
            try:
                other_user_id = user["Id"]
                # Get in-progress items for this user
                in_progress = await client.get_in_progress_items(
                    user_id=other_user_id,
                    include_item_types=["Movie", "Episode"]
                )
                for emby_item in in_progress:
                    path = emby_item.get("Path")
                    if path and path in path_to_item:
                        item = path_to_item[path]
                        user_data = emby_item.get("UserData", {})
                        # Mark as in progress if any user has it in progress
                        if user_data.get("PlayedPercentage", 0) > 0 and not user_data.get("Played"):
                            item.progress_percent = max(
                                item.progress_percent or 0,
                                user_data.get("PlayedPercentage", 0)
                            )
            except Exception as e:
                logger.debug(f"Failed to get watch data for user {user.get('Name')}: {e}")
        
        await db.commit()
        logger.info(f"Updated watch data for {updated} items from Emby")
        
    finally:
        await client.close()
    
    return {
        "success": True,
        "message": f"Updated watch data for {updated} items",
        "added": 0,
        "updated": updated
    }
