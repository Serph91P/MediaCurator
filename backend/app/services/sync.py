"""
Sync service for fetching media items from services.
"""
import asyncio
from typing import Dict, Any, Optional, Callable, Awaitable
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from loguru import logger

from ..models import ServiceConnection, MediaItem, ServiceType, MediaType, ImportStats, MediaServerUser, UserWatchHistory, PlaybackActivity, Library
from .sonarr import SonarrClient
from .radarr import RadarrClient
from .emby import EmbyClient

# Type for progress callback
ProgressCallback = Optional[Callable[[str, Optional[float], Optional[int], Optional[int], Optional[Dict]], Awaitable[None]]]


async def sync_service_media(
    db: AsyncSession,
    service: ServiceConnection,
    progress_callback: ProgressCallback = None
) -> Dict[str, Any]:
    """Sync media items from a service connection."""
    logger.info(f"Starting sync for service: {service.name}")
    
    start_time = datetime.now(timezone.utc)
    added = 0
    updated = 0
    errors = []
    
    try:
        if service.service_type == ServiceType.SONARR:
            result = await _sync_sonarr(db, service, progress_callback)
        elif service.service_type == ServiceType.RADARR:
            result = await _sync_radarr(db, service, progress_callback)
        elif service.service_type in [ServiceType.EMBY, ServiceType.JELLYFIN]:
            result = await _sync_emby(db, service, progress_callback)
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
    service: ServiceConnection,
    progress_callback: ProgressCallback = None
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
        total_series = len(series_list)
        
        if progress_callback:
            await progress_callback("Fetching series list", 5, 0, total_series, {"total_series": total_series})
        
        for idx, series in enumerate(series_list):
            if progress_callback and idx % 5 == 0:
                pct = 5 + (idx / max(total_series, 1)) * 85
                await progress_callback(
                    f"Syncing series {idx+1}/{total_series}: {series.get('title', 'Unknown')}",
                    pct, idx, total_series, None
                )
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
        
        if progress_callback:
            await progress_callback("Sonarr sync complete", 100, total_series, total_series, {"added": added, "updated": updated})
        
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
    service: ServiceConnection,
    progress_callback: ProgressCallback = None
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
        total_movies = len(movies)
        
        if progress_callback:
            await progress_callback("Fetching movie list", 5, 0, total_movies, {"total_movies": total_movies})
        
        for idx, movie in enumerate(movies):
            if progress_callback and idx % 10 == 0:
                pct = 5 + (idx / max(total_movies, 1)) * 90
                await progress_callback(
                    f"Syncing movie {idx+1}/{total_movies}: {movie.get('title', 'Unknown')}",
                    pct, idx, total_movies, None
                )
            
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
        
        if progress_callback:
            await progress_callback("Radarr sync complete", 100, total_movies, total_movies, {"added": added, "updated": updated})
        
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
    service: ServiceConnection,
    progress_callback: ProgressCallback = None
) -> Dict[str, Any]:
    """
    Sync watch data from Emby/Jellyfin to existing MediaItems.
    
    This function:
    1. Syncs Emby libraries (for library_id assignment)
    2. Matches existing MediaItems (from Sonarr/Radarr) by PATH
    3. Updates library_id on matched items
    4. Syncs watch statistics from Emby users
    5. Does NOT create new MediaItems (that's Sonarr/Radarr's job)
    
    If no Sonarr/Radarr is configured, it will create items from Emby as fallback.
    """
    timeout = max(service.timeout or 30, 120)
    client = EmbyClient(
        url=service.url,
        api_key=service.api_key,
        verify_ssl=service.verify_ssl,
        timeout=timeout
    )
    
    updated = 0
    users_synced = 0
    library_assignments = 0
    
    try:
        # === SYNC LIBRARIES FROM EMBY ===
        logger.info("Syncing libraries from Emby...")
        if progress_callback:
            await progress_callback("Syncing Emby libraries", 2, None, None, None)
        emby_libraries = await client.get_libraries()
        
        # Build library mapping
        library_map: Dict[str, Library] = {}
        
        for emby_lib in emby_libraries:
            external_id = emby_lib.get("ItemId") or emby_lib.get("Id", "")
            name = emby_lib.get("Name", "Unknown")
            collection_type = emby_lib.get("CollectionType", "").lower()
            paths = emby_lib.get("Locations", [])
            path = paths[0] if paths else None
            
            # Only sync movie and series libraries
            if collection_type not in ("movies", "movie", "tvshows", "tvshow", "series"):
                continue
            
            # Determine media type
            if collection_type in ("movies", "movie"):
                media_type = MediaType.MOVIE
            else:
                media_type = MediaType.SERIES
            
            # Get or create library
            result = await db.execute(
                select(Library).where(
                    Library.external_id == external_id,
                    Library.service_connection_id == service.id
                )
            )
            db_lib = result.scalar_one_or_none()
            
            if db_lib:
                db_lib.name = name
                db_lib.path = path
                db_lib.media_type = media_type
                db_lib.last_synced_at = datetime.utcnow()
            else:
                db_lib = Library(
                    name=name,
                    external_id=external_id,
                    service_connection_id=service.id,
                    media_type=media_type,
                    path=path,
                    is_enabled=True,
                    last_synced_at=datetime.utcnow()
                )
                db.add(db_lib)
                await db.flush()
            
            library_map[external_id] = db_lib
        
        logger.info(f"Synced {len(library_map)} libraries")
        
        if progress_callback:
            await progress_callback(f"Synced {len(library_map)} libraries", 10, len(library_map), len(library_map), None)
        
        # Build library paths for matching (all paths from all Emby libraries)
        library_paths: list[tuple[str, int, MediaType]] = []
        for db_lib in library_map.values():
            if db_lib.path:
                library_paths.append((db_lib.path.replace("\\", "/"), db_lib.id, db_lib.media_type))
        library_paths.sort(key=lambda x: len(x[0]), reverse=True)
        
        def find_library_for_path(item_path: str | None) -> int | None:
            """Find the library_id for an item based on its path."""
            if not item_path:
                return None
            item_path_normalized = item_path.replace("\\", "/")
            for lib_path, lib_id, lib_type in library_paths:
                if item_path_normalized.startswith(lib_path):
                    return lib_id
            return None
        
        # === GET ALL EXISTING MEDIA ITEMS (from Sonarr/Radarr) ===
        # We match by path to update library_id and apply watch data
        result = await db.execute(
            select(MediaItem).options(
                joinedload(MediaItem.service_connection),
                joinedload(MediaItem.library)
            )
        )
        all_items = result.scalars().all()
        
        # Build path -> item mapping (normalize paths)
        path_to_item: Dict[str, MediaItem] = {}
        for item in all_items:
            if item.path:
                normalized_path = item.path.replace("\\", "/")
                path_to_item[normalized_path] = item
        
        logger.info(f"Found {len(path_to_item)} existing media items with paths")
        
        if progress_callback:
            await progress_callback("Matching media paths to libraries", 15, None, None, {"items_with_paths": len(path_to_item)})
        
        # === UPDATE LIBRARY_ID ON EXISTING ITEMS ===
        for item in all_items:
            if item.path and not item.library_id:
                lib_id = find_library_for_path(item.path)
                if lib_id:
                    item.library_id = lib_id
                    library_assignments += 1
        
        logger.info(f"Assigned library_id to {library_assignments} items")
        
        if progress_callback:
            await progress_callback(f"Assigned {library_assignments} library mappings", 20, library_assignments, len(all_items), None)
        
        # === SYNC USERS ===
        users = await client.get_users()
        
        if not users:
            logger.warning("No users found in Emby")
            await db.commit()
            return {"success": True, "message": "No users found", "added": 0, "updated": updated}
        
        logger.info(f"Found {len(users)} users in Emby")
        
        user_id_map: Dict[str, int] = {}  # Emby user ID -> DB user ID
        
        for emby_user in users:
            emby_user_id = emby_user["Id"]
            emby_user_name = emby_user.get("Name", "Unknown")
            is_admin = emby_user.get("Policy", {}).get("IsAdministrator", False)
            
            result = await db.execute(
                select(MediaServerUser).where(
                    MediaServerUser.external_id == emby_user_id,
                    MediaServerUser.service_connection_id == service.id
                )
            )
            db_user = result.scalar_one_or_none()
            
            if db_user:
                db_user.name = emby_user_name
                db_user.is_admin = is_admin
            else:
                db_user = MediaServerUser(
                    external_id=emby_user_id,
                    service_connection_id=service.id,
                    name=emby_user_name,
                    is_admin=is_admin
                )
                db.add(db_user)
                await db.flush()
            
            user_id_map[emby_user_id] = db_user.id
            users_synced += 1
        
        logger.info(f"Synced {users_synced} users to database")
        
        if progress_callback:
            await progress_callback(f"Synced {users_synced} users", 25, users_synced, len(users), None)
        
        # Get active sessions to mark currently watching (by path)
        sessions = await client.get_sessions()
        currently_watching_paths: set[str] = set()
        for session in sessions:
            now_playing = session.get("NowPlayingItem", {})
            if now_playing and now_playing.get("Path"):
                currently_watching_paths.add(now_playing.get("Path").replace("\\", "/"))
        
        # Track watch data per path (normalized)
        max_watch_counts: dict[str, int] = {}  # path -> max watch count
        watched_paths: set[str] = set()
        favorited_paths: set[str] = set()
        max_progress: dict[str, float] = {}
        last_watched: dict[str, datetime] = {}
        
        # Track unique users who watched each item (for "Most Popular by Users")
        users_who_watched: dict[str, set[int]] = {}  # path -> set of db_user_ids
        
        # Track per-user watch data for UserWatchHistory
        user_watch_data: dict[tuple[int, str], dict] = {}  # (db_user_id, path) -> watch_data
        
        # Track per-user statistics for aggregation
        user_watch_time: dict[int, int] = {}  # db_user_id -> total seconds
        user_play_count: dict[int, int] = {}  # db_user_id -> total plays
        user_last_activity: dict[int, datetime] = {}  # db_user_id -> last played
        
        # Helper function to track watch data per path
        def track_watch_data(emby_item: dict, db_user_id: int):
            path = emby_item.get("Path")
            if not path:
                return
            
            # Normalize path
            normalized_path = path.replace("\\", "/")
            
            # Only track if we have this item in our database
            if normalized_path not in path_to_item:
                return
            
            user_data = emby_item.get("UserData", {})
            
            play_count = user_data.get("PlayCount", 0) or 0
            is_played = user_data.get("Played", False)
            is_favorite = user_data.get("IsFavorite", False)
            
            # If marked as played but PlayCount is 0, count it as at least 1 play
            if is_played and play_count == 0:
                play_count = 1
            
            max_watch_counts[normalized_path] = max(max_watch_counts.get(normalized_path, 0), play_count)
            
            if is_played:
                watched_paths.add(normalized_path)
                if normalized_path not in users_who_watched:
                    users_who_watched[normalized_path] = set()
                users_who_watched[normalized_path].add(db_user_id)
                
                # Track user play count (sum across all items)
                user_play_count[db_user_id] = user_play_count.get(db_user_id, 0) + play_count
                
                # Track user watch time (estimated from runtime * plays)
                runtime_ticks = emby_item.get("RunTimeTicks", 0) or 0
                runtime_seconds = int(runtime_ticks / 10_000_000) if runtime_ticks else 0
                # Use played percentage if available, otherwise assume 100% watched per play
                progress_pct = user_data.get("PlayedPercentage", 100) or 100
                watch_time = int(runtime_seconds * (progress_pct / 100) * max(play_count, 1))
                user_watch_time[db_user_id] = user_watch_time.get(db_user_id, 0) + watch_time
            
            if is_favorite:
                favorited_paths.add(normalized_path)
            
            progress = user_data.get("PlayedPercentage", 0) or 0
            max_progress[normalized_path] = max(max_progress.get(normalized_path, 0), progress)
            
            last_played_date = None
            if user_data.get("LastPlayedDate"):
                try:
                    last_played_date = datetime.fromisoformat(
                        user_data["LastPlayedDate"].replace("Z", "+00:00")
                    )
                    if normalized_path not in last_watched or last_played_date > last_watched[normalized_path]:
                        last_watched[normalized_path] = last_played_date
                    # Track user's last activity
                    if db_user_id not in user_last_activity or last_played_date > user_last_activity[db_user_id]:
                        user_last_activity[db_user_id] = last_played_date
                except:
                    pass
            
            # Store per-user watch data for UserWatchHistory
            if is_played or play_count > 0 or is_favorite or progress > 0:
                item = path_to_item[normalized_path]
                user_watch_data[(db_user_id, normalized_path)] = {
                    "play_count": play_count,
                    "is_played": is_played,
                    "is_favorite": is_favorite,
                    "progress": progress,
                    "last_played_at": last_played_date,
                    "media_item_id": item.id
                }
        
        # Process users ONE BY ONE to save memory (no parallel fetching)
        logger.info(f"Fetching watch data from {len(users)} users sequentially...")
        
        for i, user in enumerate(users, 1):
            emby_user_id = user["Id"]
            user_name = user.get("Name", "Unknown")
            db_user_id = user_id_map.get(emby_user_id)
            
            if not db_user_id:
                continue
            
            try:
                logger.debug(f"Processing user {i}/{len(users)}: {user_name}")
                
                if progress_callback:
                    pct = 25 + (i / max(len(users), 1)) * 50
                    await progress_callback(
                        f"Fetching watch data for user {i}/{len(users)}: {user_name}",
                        pct, i, len(users), {"user": user_name}
                    )
                
                # Fetch and process movies immediately (don't hold in memory)
                emby_movies = await client.get_items_with_watch_data(
                    user_id=emby_user_id, 
                    include_item_types=["Movie"],
                    fields=["Path", "RunTimeTicks"]
                )
                for emby_item in emby_movies:
                    track_watch_data(emby_item, db_user_id)
                del emby_movies  # Free memory immediately
                
                # Fetch and process series immediately
                emby_series = await client.get_items_with_watch_data(
                    user_id=emby_user_id,
                    include_item_types=["Series"],
                    fields=["Path", "RunTimeTicks"]
                )
                for emby_item in emby_series:
                    track_watch_data(emby_item, db_user_id)
                del emby_series  # Free memory immediately
                
                # Fetch and process episodes immediately (this is the big one)
                emby_episodes = await client.get_items_with_watch_data(
                    user_id=emby_user_id,
                    include_item_types=["Episode"],
                    fields=["Path", "RunTimeTicks"]
                )
                for emby_item in emby_episodes:
                    track_watch_data(emby_item, db_user_id)
                del emby_episodes  # Free memory immediately
                
                logger.debug(f"Completed user {i}/{len(users)}: {user_name}")
                
            except Exception as e:
                logger.warning(f"Failed to get watch data for user {user_name}: {e}")
                continue
        
        # Now apply the aggregated watch data to items (by path)
        watch_updated = 0
        for normalized_path, item in path_to_item.items():
            if normalized_path not in max_watch_counts and normalized_path not in watched_paths:
                continue
            
            item.watch_count = max_watch_counts.get(normalized_path, 0)
            item.is_watched = normalized_path in watched_paths
            item.is_favorited = normalized_path in favorited_paths
            item.progress_percent = max_progress.get(normalized_path, 0)
            item.is_currently_watching = normalized_path in currently_watching_paths
            
            if normalized_path in last_watched:
                item.last_watched_at = last_watched[normalized_path]
                item.last_progress_update = datetime.utcnow()
            
            watch_updated += 1
        
        updated += watch_updated
        logger.info(f"Updated watch data for {watch_updated} items")
        
        if progress_callback:
            await progress_callback("Saving watch history", 85, watch_updated, len(path_to_item), {"watch_updated": watch_updated})
        
        # === UPDATE USER STATISTICS ===
        logger.info("Updating user statistics...")
        for db_user_id in user_id_map.values():
            result = await db.execute(
                select(MediaServerUser).where(MediaServerUser.id == db_user_id)
            )
            db_user = result.scalar_one_or_none()
            if db_user:
                db_user.total_plays = user_play_count.get(db_user_id, 0)
                db_user.total_watch_time_seconds = user_watch_time.get(db_user_id, 0)
                if db_user_id in user_last_activity:
                    db_user.last_activity_at = user_last_activity[db_user_id]
        
        # === SAVE USER WATCH HISTORY ===
        logger.info(f"Saving {len(user_watch_data)} user watch history records...")
        history_saved = 0
        
        for (db_user_id, normalized_path), watch_data in user_watch_data.items():
            media_item_id = watch_data.get("media_item_id")
            if not media_item_id:
                continue
            
            # Get or create watch history record
            result = await db.execute(
                select(UserWatchHistory).where(
                    UserWatchHistory.user_id == db_user_id,
                    UserWatchHistory.media_item_id == media_item_id
                )
            )
            history = result.scalar_one_or_none()
            
            if history:
                history.play_count = watch_data["play_count"]
                history.is_played = watch_data["is_played"]
                history.is_favorite = watch_data["is_favorite"]
                history.played_percentage = watch_data["progress"]
                if watch_data["last_played_at"]:
                    history.last_played_at = watch_data["last_played_at"]
            else:
                history = UserWatchHistory(
                    user_id=db_user_id,
                    media_item_id=media_item_id,
                    play_count=watch_data["play_count"],
                    is_played=watch_data["is_played"],
                    is_favorite=watch_data["is_favorite"],
                    played_percentage=watch_data["progress"],
                    last_played_at=watch_data["last_played_at"]
                )
                db.add(history)
            
            history_saved += 1
        
        await db.commit()
        logger.info(f"Updated watch data for {watch_updated} items from Emby (max values from {len(users)} users), saved {history_saved} watch history records")
        
        if progress_callback:
            await progress_callback("Syncing active sessions", 92, None, None, {"history_saved": history_saved})
        
        # === SYNC ACTIVE SESSIONS ===
        await _sync_active_sessions(db, client, service, user_id_map, path_to_item)
        
        if progress_callback:
            await progress_callback("Emby sync complete", 100, None, None, {
                "updated": updated,
                "library_assignments": library_assignments,
                "users_synced": users_synced
            })
        
    finally:
        await client.close()
    
    return {
        "success": True,
        "message": f"Updated watch data for {updated} items, assigned {library_assignments} libraries, synced {users_synced} users",
        "added": 0,
        "updated": updated,
        "library_assignments": library_assignments,
        "users_synced": users_synced
    }


async def _sync_active_sessions(
    db: AsyncSession,
    client: EmbyClient,
    service: ServiceConnection,
    user_id_map: Dict[str, int],
    path_to_item: Dict[str, MediaItem]
):
    """Sync active and recent playback sessions from Emby."""
    try:
        # Get active sessions
        sessions = await client.get_sessions()
        
        # Mark all existing active sessions as inactive first
        result = await db.execute(
            select(PlaybackActivity).where(PlaybackActivity.is_active == True)
        )
        active_activities = result.scalars().all()
        for activity in active_activities:
            activity.is_active = False
            if not activity.ended_at:
                activity.ended_at = datetime.now(timezone.utc)
        
        active_count = 0
        
        for session in sessions:
            now_playing = session.get("NowPlayingItem")
            if not now_playing:
                continue
            
            emby_user_id = session.get("UserId")
            db_user_id = user_id_map.get(emby_user_id)
            
            if not db_user_id:
                continue
            
            # Get media item by path (normalize path for matching)
            item_path = now_playing.get("Path")
            media_item = None
            if item_path:
                normalized_path = item_path.replace("\\", "/")
                media_item = path_to_item.get(normalized_path)
            
            # Get or create title
            title = now_playing.get("Name", "Unknown")
            series_name = now_playing.get("SeriesName")
            if series_name:
                season_num = now_playing.get("ParentIndexNumber", 0)
                episode_num = now_playing.get("IndexNumber", 0)
                title = f"{series_name} : S{season_num}E{episode_num} - {title}"
            
            # Determine play method
            play_state = session.get("PlayState", {})
            transcode_info = session.get("TranscodingInfo", {})
            
            if transcode_info:
                play_method = "Transcode"
                is_transcoding = True
                transcode_video = transcode_info.get("IsVideoDirect", True) == False
                transcode_audio = transcode_info.get("IsAudioDirect", True) == False
            else:
                play_method = "DirectPlay" if not session.get("TranscodingInfo") else "DirectStream"
                is_transcoding = False
                transcode_video = False
                transcode_audio = False
            
            # Check if we have an existing active session for this user+item
            session_id = session.get("Id")
            
            result = await db.execute(
                select(PlaybackActivity).where(
                    PlaybackActivity.user_id == db_user_id,
                    PlaybackActivity.session_id == session_id
                )
            )
            existing = result.scalar_one_or_none()
            
            position_ticks = play_state.get("PositionTicks", 0)
            runtime_ticks = now_playing.get("RunTimeTicks", 1) or 1
            played_percentage = (position_ticks / runtime_ticks * 100) if runtime_ticks else 0
            
            if existing:
                # Update existing session
                existing.is_active = True
                existing.ended_at = None
                existing.position_ticks = position_ticks
                existing.played_percentage = played_percentage
                existing.duration_seconds = int(position_ticks / 10_000_000)  # Ticks to seconds
            else:
                # Create new session
                activity = PlaybackActivity(
                    user_id=db_user_id,
                    media_item_id=media_item.id if media_item else None,
                    media_title=title,
                    library_id=media_item.library_id if media_item else None,
                    session_id=session_id,
                    play_method=play_method,
                    client_name=session.get("Client"),
                    device_name=session.get("DeviceName"),
                    device_id=session.get("DeviceId"),
                    ip_address=session.get("RemoteEndPoint"),
                    is_transcoding=is_transcoding,
                    transcode_video=transcode_video,
                    transcode_audio=transcode_audio,
                    started_at=datetime.now(timezone.utc),
                    position_ticks=position_ticks,
                    runtime_ticks=runtime_ticks,
                    played_percentage=played_percentage,
                    is_active=True
                )
                db.add(activity)
            
            active_count += 1
        
        await db.commit()
        logger.info(f"Synced {active_count} active playback sessions")
        
    except Exception as e:
        logger.warning(f"Failed to sync active sessions: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
