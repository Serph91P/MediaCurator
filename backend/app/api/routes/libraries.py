"""
Libraries API routes - auto-synced from Emby/Jellyfin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from typing import List, Dict, Any
from datetime import datetime, timedelta
from loguru import logger

from ...core.database import get_db
from ...models import Library, ServiceConnection, ServiceType, MediaType, MediaItem, UserWatchHistory
from ...schemas import LibraryUpdate, LibraryResponse, LibrarySyncResponse
from ...services import EmbyClient
from ..deps import get_current_user

router = APIRouter(prefix="/libraries", tags=["Libraries"])


@router.get("/stats")
async def get_library_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """Get detailed statistics for all libraries (Jellystat-style)."""
    
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
