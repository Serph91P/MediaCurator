"""
Libraries API routes - auto-synced from Emby/Jellyfin.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from loguru import logger

from ...core.database import get_db
from ...models import Library, ServiceConnection, ServiceType, MediaType, MediaItem, UserWatchHistory, PlaybackActivity
from ...schemas import LibraryUpdate, LibraryResponse, LibrarySyncResponse
from ...services import EmbyClient
from ..deps import get_current_user

router = APIRouter(prefix="/libraries", tags=["Libraries"])


@router.get("/stats")
async def get_library_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get detailed statistics for all libraries."""
    
    result = await db.execute(
        select(Library).order_by(Library.media_type, Library.name)
    )
    libraries = result.scalars().all()
    
    # Get service info
    services_result = await db.execute(select(ServiceConnection))
    services = {s.id: s for s in services_result.scalars().all()}
    
    stats = []
    for lib in libraries:
        service = services.get(lib.service_connection_id)
        
        # Count items by type
        if lib.media_type == MediaType.MOVIE:
            # Movie library
            total_files = await db.execute(
                select(func.count(MediaItem.id)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.MOVIE)
                )
            )
            total_files_count = total_files.scalar() or 0
            
            # Total size
            total_size = await db.execute(
                select(func.sum(MediaItem.size_bytes)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.MOVIE)
                )
            )
            total_size_bytes = int(total_size.scalar() or 0)
            
            # Total plays
            total_plays = await db.execute(
                select(func.sum(MediaItem.watch_count)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.MOVIE)
                )
            )
            total_plays_count = int(total_plays.scalar() or 0)
            
            # Last played item
            last_played = await db.execute(
                select(MediaItem.title, MediaItem.last_watched_at)
                .where(
                    and_(
                        MediaItem.library_id == lib.id,
                        MediaItem.last_watched_at.isnot(None)
                    )
                )
                .order_by(MediaItem.last_watched_at.desc())
                .limit(1)
            )
            last_played_row = last_played.first()
            
            # Last activity
            last_activity = await db.execute(
                select(func.max(MediaItem.last_watched_at)).where(
                    MediaItem.library_id == lib.id
                )
            )
            last_activity_at = last_activity.scalar()
            
            stats.append({
                "id": lib.id,
                "name": lib.name,
                "type": "Movies",
                "media_type": lib.media_type.value,
                "is_enabled": lib.is_enabled,
                "service_name": service.name if service else None,
                "total_files": total_files_count,
                "total_size_bytes": total_size_bytes,
                "total_plays": total_plays_count,
                "total_playback_seconds": 0,  # We don't track this yet
                "last_played": last_played_row.title if last_played_row else None,
                "last_activity_at": last_activity_at.isoformat() if last_activity_at else None,
                "movies": total_files_count,
                "series": 0,
                "seasons": 0,
                "episodes": 0,
                "path": lib.path,
                "last_synced_at": lib.last_synced_at.isoformat() if lib.last_synced_at else None
            })
        else:
            # Series library
            series_count = await db.execute(
                select(func.count(MediaItem.id)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.SERIES)
                )
            )
            series_count_val = series_count.scalar() or 0
            
            season_count = await db.execute(
                select(func.count(MediaItem.id)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.SEASON)
                )
            )
            season_count_val = season_count.scalar() or 0
            
            episode_count = await db.execute(
                select(func.count(MediaItem.id)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.EPISODE)
                )
            )
            episode_count_val = episode_count.scalar() or 0
            
            # Total size (sum of all items in library)
            total_size = await db.execute(
                select(func.sum(MediaItem.size_bytes)).where(
                    MediaItem.library_id == lib.id
                )
            )
            total_size_bytes = int(total_size.scalar() or 0)
            
            # Total plays (from episodes)
            total_plays = await db.execute(
                select(func.sum(MediaItem.watch_count)).where(
                    and_(MediaItem.library_id == lib.id, MediaItem.media_type == MediaType.EPISODE)
                )
            )
            total_plays_count = int(total_plays.scalar() or 0)
            
            # Last played item
            last_played = await db.execute(
                select(MediaItem.title, MediaItem.last_watched_at)
                .where(
                    and_(
                        MediaItem.library_id == lib.id,
                        MediaItem.last_watched_at.isnot(None)
                    )
                )
                .order_by(MediaItem.last_watched_at.desc())
                .limit(1)
            )
            last_played_row = last_played.first()
            
            # Last activity
            last_activity = await db.execute(
                select(func.max(MediaItem.last_watched_at)).where(
                    MediaItem.library_id == lib.id
                )
            )
            last_activity_at = last_activity.scalar()
            
            stats.append({
                "id": lib.id,
                "name": lib.name,
                "type": "Series",
                "media_type": lib.media_type.value,
                "is_enabled": lib.is_enabled,
                "service_name": service.name if service else None,
                "total_files": episode_count_val,
                "total_size_bytes": total_size_bytes,
                "total_plays": total_plays_count,
                "total_playback_seconds": 0,
                "last_played": last_played_row.title if last_played_row else None,
                "last_activity_at": last_activity_at.isoformat() if last_activity_at else None,
                "movies": 0,
                "series": series_count_val,
                "seasons": season_count_val,
                "episodes": episode_count_val,
                "path": lib.path,
                "last_synced_at": lib.last_synced_at.isoformat() if lib.last_synced_at else None
            })
    
    return stats


@router.get("/", response_model=List[LibraryResponse])
async def list_libraries(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all synced libraries."""
    result = await db.execute(select(Library))
    return result.scalars().all()


@router.get("/{library_id}", response_model=LibraryResponse)
async def get_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get a specific library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    return library


@router.get("/{library_id}/details")
async def get_library_details(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get detailed statistics for a specific library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    # Get service info
    service_result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == library.service_connection_id)
    )
    service = service_result.scalar_one_or_none()
    
    # Time periods
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    
    # Build base stats
    if library.media_type == MediaType.MOVIE:
        # Movie library
        total_items = await db.execute(
            select(func.count(MediaItem.id)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.MOVIE)
            )
        )
        total_items_count = total_items.scalar() or 0
        
        # Total size
        total_size = await db.execute(
            select(func.sum(MediaItem.size_bytes)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.MOVIE)
            )
        )
        total_size_bytes = int(total_size.scalar() or 0)
        
        # Total plays
        total_plays = await db.execute(
            select(func.sum(MediaItem.watch_count)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.MOVIE)
            )
        )
        total_plays_count = int(total_plays.scalar() or 0)
        
        item_breakdown = {
            "movies": total_items_count,
            "series": 0,
            "seasons": 0,
            "episodes": 0
        }
    else:
        # Series library
        series_count = await db.execute(
            select(func.count(MediaItem.id)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.SERIES)
            )
        )
        series_count_val = series_count.scalar() or 0
        
        season_count = await db.execute(
            select(func.count(MediaItem.id)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.SEASON)
            )
        )
        season_count_val = season_count.scalar() or 0
        
        episode_count = await db.execute(
            select(func.count(MediaItem.id)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.EPISODE)
            )
        )
        total_items_count = episode_count.scalar() or 0
        
        # Total size
        total_size = await db.execute(
            select(func.sum(MediaItem.size_bytes)).where(MediaItem.library_id == library.id)
        )
        total_size_bytes = int(total_size.scalar() or 0)
        
        # Total plays (from episodes)
        total_plays = await db.execute(
            select(func.sum(MediaItem.watch_count)).where(
                and_(MediaItem.library_id == library.id, MediaItem.media_type == MediaType.EPISODE)
            )
        )
        total_plays_count = int(total_plays.scalar() or 0)
        
        item_breakdown = {
            "movies": 0,
            "series": series_count_val,
            "seasons": season_count_val,
            "episodes": total_items_count
        }
    
    # Activity stats by time period
    plays_24h = await db.execute(
        select(func.count(PlaybackActivity.id)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= day_ago
            )
        )
    )
    plays_7d = await db.execute(
        select(func.count(PlaybackActivity.id)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= week_ago
            )
        )
    )
    plays_30d = await db.execute(
        select(func.count(PlaybackActivity.id)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= month_ago
            )
        )
    )
    
    # Watch time by period
    watch_time_24h = await db.execute(
        select(func.coalesce(func.sum(PlaybackActivity.duration_seconds), 0)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= day_ago
            )
        )
    )
    watch_time_7d = await db.execute(
        select(func.coalesce(func.sum(PlaybackActivity.duration_seconds), 0)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= week_ago
            )
        )
    )
    watch_time_30d = await db.execute(
        select(func.coalesce(func.sum(PlaybackActivity.duration_seconds), 0)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= month_ago
            )
        )
    )
    
    # Top users for this library (last 30 days)
    top_users = await db.execute(
        select(
            PlaybackActivity.user_id,
            func.count(PlaybackActivity.id).label("plays"),
            func.sum(PlaybackActivity.duration_seconds).label("watch_time")
        )
        .where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.started_at >= month_ago
            )
        )
        .group_by(PlaybackActivity.user_id)
        .order_by(func.count(PlaybackActivity.id).desc())
        .limit(5)
    )
    top_users_list = [
        {
            "user_id": row.user_id,
            "plays": row.plays,
            "watch_time_seconds": int(row.watch_time or 0)
        }
        for row in top_users.all()
    ]
    
    # Recently watched items
    recently_watched = await db.execute(
        select(MediaItem)
        .where(
            and_(
                MediaItem.library_id == library.id,
                MediaItem.last_watched_at.isnot(None)
            )
        )
        .order_by(MediaItem.last_watched_at.desc())
        .limit(10)
    )
    recently_watched_list = [
        {
            "id": item.id,
            "title": item.title,
            "media_type": item.media_type.value,
            "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
            "watch_count": item.watch_count
        }
        for item in recently_watched.scalars().all()
    ]
    
    # Active sessions in this library
    active_sessions = await db.execute(
        select(func.count(PlaybackActivity.id)).where(
            and_(
                PlaybackActivity.library_id == library.id,
                PlaybackActivity.is_active == True
            )
        )
    )
    
    return {
        "id": library.id,
        "name": library.name,
        "type": "Movies" if library.media_type == MediaType.MOVIE else "Series",
        "media_type": library.media_type.value,
        "is_enabled": library.is_enabled,
        "path": library.path,
        "service_name": service.name if service else None,
        "external_id": library.external_id,
        "last_synced_at": library.last_synced_at.isoformat() if library.last_synced_at else None,
        
        # Item counts
        "total_items": total_items_count,
        "total_size_bytes": total_size_bytes,
        "total_plays": total_plays_count,
        "item_breakdown": item_breakdown,
        
        # Time-based stats
        "stats": {
            "plays_24h": plays_24h.scalar() or 0,
            "plays_7d": plays_7d.scalar() or 0,
            "plays_30d": plays_30d.scalar() or 0,
            "watch_time_24h": int(watch_time_24h.scalar() or 0),
            "watch_time_7d": int(watch_time_7d.scalar() or 0),
            "watch_time_30d": int(watch_time_30d.scalar() or 0)
        },
        
        # Top users
        "top_users": top_users_list,
        
        # Recently watched
        "recently_watched": recently_watched_list,
        
        # Active sessions
        "active_sessions": active_sessions.scalar() or 0
    }


@router.get("/{library_id}/media")
async def get_library_media(
    library_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    sort_by: str = Query("title", pattern="^(title|added_at|last_watched_at|watch_count|size_bytes)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    media_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get paginated media items for a library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    # Build query
    query = select(MediaItem).where(MediaItem.library_id == library_id)
    count_query = select(func.count(MediaItem.id)).where(MediaItem.library_id == library_id)
    
    # Filter by media type (for Series library, show only series or episodes)
    if media_type:
        media_type_enum = MediaType(media_type)
        query = query.where(MediaItem.media_type == media_type_enum)
        count_query = count_query.where(MediaItem.media_type == media_type_enum)
    elif library.media_type == MediaType.SERIES:
        # By default show only series (not seasons/episodes)
        query = query.where(MediaItem.media_type == MediaType.SERIES)
        count_query = count_query.where(MediaItem.media_type == MediaType.SERIES)
    
    # Search filter
    if search:
        search_pattern = f"%{search}%"
        query = query.where(MediaItem.title.ilike(search_pattern))
        count_query = count_query.where(MediaItem.title.ilike(search_pattern))
    
    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Sorting
    sort_column = getattr(MediaItem, sort_by, MediaItem.title)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc().nullslast())
    else:
        query = query.order_by(sort_column.asc().nullsfirst())
    
    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return {
        "items": [
            {
                "id": item.id,
                "title": item.title,
                "media_type": item.media_type.value,
                "external_id": item.external_id,
                "added_at": item.added_at.isoformat() if item.added_at else None,
                "last_watched_at": item.last_watched_at.isoformat() if item.last_watched_at else None,
                "watch_count": item.watch_count,
                "size_bytes": item.size_bytes,
                "year": item.year
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1
    }


@router.get("/{library_id}/activity")
async def get_library_activity(
    library_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get playback activity for a specific library."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    # Get total count
    count_query = select(func.count(PlaybackActivity.id)).where(
        PlaybackActivity.library_id == library_id
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # Get activity
    offset = (page - 1) * page_size
    query = (
        select(PlaybackActivity)
        .where(PlaybackActivity.library_id == library_id)
        .order_by(PlaybackActivity.started_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    activities = result.scalars().all()
    
    return {
        "items": [
            {
                "id": activity.id,
                "user_id": activity.user_id,
                "media_title": activity.media_title,
                "client_name": activity.client_name,
                "device_name": activity.device_name,
                "play_method": activity.play_method,
                "is_transcoding": activity.is_transcoding,
                "started_at": activity.started_at.isoformat() if activity.started_at else None,
                "ended_at": activity.ended_at.isoformat() if activity.ended_at else None,
                "duration_seconds": activity.duration_seconds,
                "played_percentage": activity.played_percentage,
                "is_active": activity.is_active
            }
            for activity in activities
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1
    }


@router.patch("/{library_id}", response_model=LibraryResponse)
async def update_library(
    library_id: int,
    library_data: LibraryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Update library settings (enable/disable)."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    if library_data.is_enabled is not None:
        library.is_enabled = library_data.is_enabled
    
    await db.commit()
    await db.refresh(library)
    return library


@router.post("/{library_id}/toggle", response_model=LibraryResponse)
async def toggle_library(
    library_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Toggle library enabled state."""
    result = await db.execute(
        select(Library).where(Library.id == library_id)
    )
    library = result.scalar_one_or_none()
    if not library:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Library not found"
        )
    
    library.is_enabled = not library.is_enabled
    await db.commit()
    await db.refresh(library)
    return library


def _determine_media_type(collection_type: str) -> MediaType:
    """Determine MediaType from Emby/Jellyfin collection type."""
    collection_type = (collection_type or "").lower()
    if collection_type in ("movies", "movie"):
        return MediaType.MOVIE
    elif collection_type in ("tvshows", "tvshow", "series"):
        return MediaType.SERIES
    # Default to movie for unknown types
    return MediaType.MOVIE


@router.post("/sync", response_model=LibrarySyncResponse)
async def sync_all_libraries(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Sync libraries from all connected Emby/Jellyfin services."""
    # Get all enabled Emby/Jellyfin services
    result = await db.execute(
        select(ServiceConnection).where(
            and_(
                ServiceConnection.service_type.in_([ServiceType.EMBY, ServiceType.JELLYFIN]),
                ServiceConnection.is_enabled == True
            )
        )
    )
    services = result.scalars().all()
    
    if not services:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Emby/Jellyfin services configured. Add a service first."
        )
    
    total_synced = 0
    total_removed = 0
    errors = []
    
    for service in services:
        try:
            client = EmbyClient(
                url=service.url,
                api_key=service.api_key,
                verify_ssl=service.verify_ssl,
                timeout=service.timeout
            )
            
            # Fetch libraries from Emby/Jellyfin
            emby_libraries = await client.get_libraries()
            await client.close()
            
            # Get existing libraries for this service
            existing_result = await db.execute(
                select(Library).where(Library.service_connection_id == service.id)
            )
            existing_libraries = {lib.external_id: lib for lib in existing_result.scalars().all()}
            
            synced_ids = set()
            
            for emby_lib in emby_libraries:
                external_id = emby_lib.get("ItemId") or emby_lib.get("Id", "")
                name = emby_lib.get("Name", "Unknown")
                collection_type = emby_lib.get("CollectionType", "")
                paths = emby_lib.get("Locations", [])
                path = paths[0] if paths else None
                
                # Only sync movie and series libraries
                if collection_type.lower() not in ("movies", "movie", "tvshows", "tvshow", "series"):
                    continue
                
                synced_ids.add(external_id)
                media_type = _determine_media_type(collection_type)
                
                if external_id in existing_libraries:
                    # Update existing library
                    lib = existing_libraries[external_id]
                    lib.name = name
                    lib.path = path
                    lib.media_type = media_type
                    lib.last_synced_at = datetime.utcnow()
                else:
                    # Create new library
                    new_lib = Library(
                        name=name,
                        external_id=external_id,
                        service_connection_id=service.id,
                        media_type=media_type,
                        path=path,
                        is_enabled=True,
                        last_synced_at=datetime.utcnow()
                    )
                    db.add(new_lib)
                    total_synced += 1
            
            # Remove libraries that no longer exist in Emby/Jellyfin
            for ext_id, lib in existing_libraries.items():
                if ext_id not in synced_ids:
                    await db.delete(lib)
                    total_removed += 1
            
            # Update service sync time
            service.last_sync = datetime.utcnow()
            
        except Exception as e:
            logger.error(f"Error syncing libraries from {service.name}: {e}")
            errors.append(f"{service.name}: {str(e)}")
    
    await db.commit()
    
    message = f"Synced {total_synced} new libraries"
    if total_removed > 0:
        message += f", removed {total_removed} orphaned libraries"
    if errors:
        message += f". Errors: {'; '.join(errors)}"
    
    return LibrarySyncResponse(
        synced=total_synced,
        removed=total_removed,
        message=message
    )


@router.post("/sync/{service_id}", response_model=LibrarySyncResponse)
async def sync_service_libraries(
    service_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Sync libraries from a specific Emby/Jellyfin service."""
    result = await db.execute(
        select(ServiceConnection).where(ServiceConnection.id == service_id)
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found"
        )
    
    if service.service_type not in [ServiceType.EMBY, ServiceType.JELLYFIN]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only sync libraries from Emby/Jellyfin services"
        )
    
    try:
        client = EmbyClient(
            url=service.url,
            api_key=service.api_key,
            verify_ssl=service.verify_ssl,
            timeout=service.timeout
        )
        
        emby_libraries = await client.get_libraries()
        await client.close()
        
        # Get existing libraries for this service
        existing_result = await db.execute(
            select(Library).where(Library.service_connection_id == service.id)
        )
        existing_libraries = {lib.external_id: lib for lib in existing_result.scalars().all()}
        
        synced_ids = set()
        synced = 0
        removed = 0
        
        for emby_lib in emby_libraries:
            external_id = emby_lib.get("ItemId") or emby_lib.get("Id", "")
            name = emby_lib.get("Name", "Unknown")
            collection_type = emby_lib.get("CollectionType", "")
            paths = emby_lib.get("Locations", [])
            path = paths[0] if paths else None
            
            # Only sync movie and series libraries
            if collection_type.lower() not in ("movies", "movie", "tvshows", "tvshow", "series"):
                continue
            
            synced_ids.add(external_id)
            media_type = _determine_media_type(collection_type)
            
            if external_id in existing_libraries:
                # Update existing
                lib = existing_libraries[external_id]
                lib.name = name
                lib.path = path
                lib.media_type = media_type
                lib.last_synced_at = datetime.utcnow()
            else:
                # Create new
                new_lib = Library(
                    name=name,
                    external_id=external_id,
                    service_connection_id=service.id,
                    media_type=media_type,
                    path=path,
                    is_enabled=True,
                    last_synced_at=datetime.utcnow()
                )
                db.add(new_lib)
                synced += 1
        
        # Remove orphaned libraries
        for ext_id, lib in existing_libraries.items():
            if ext_id not in synced_ids:
                await db.delete(lib)
                removed += 1
        
        service.last_sync = datetime.utcnow()
        await db.commit()
        
        message = f"Synced {synced} new libraries from {service.name}"
        if removed > 0:
            message += f", removed {removed} orphaned libraries"
        
        return LibrarySyncResponse(synced=synced, removed=removed, message=message)
        
    except Exception as e:
        logger.error(f"Error syncing libraries from {service.name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync libraries: {str(e)}"
        )
