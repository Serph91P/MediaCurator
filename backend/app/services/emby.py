"""
Emby API client for media server interaction.
"""
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .base import BaseServiceClient, ServiceClientError
from ..models import ServiceConnection
from loguru import logger
from datetime import datetime, timedelta
import hashlib
import json


class SimpleCache:
    """Simple in-memory cache with TTL."""
    
    def __init__(self, default_ttl: int = 300):
        self._cache: Dict[str, tuple[Any, datetime]] = {}
        self.default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        if key in self._cache:
            value, expiry = self._cache[key]
            if datetime.utcnow() < expiry:
                return value
            else:
                del self._cache[key]
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set value in cache with TTL in seconds."""
        ttl = ttl or self.default_ttl
        expiry = datetime.utcnow() + timedelta(seconds=ttl)
        self._cache[key] = (value, expiry)
    
    def clear(self):
        """Clear all cache."""
        self._cache.clear()
    
    def remove(self, key: str):
        """Remove specific key from cache."""
        if key in self._cache:
            del self._cache[key]


# Global cache instance
_emby_cache = SimpleCache(default_ttl=300)  # 5 minutes default


class EmbyClient(BaseServiceClient):
    """Client for Emby API."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cache = _emby_cache
    
    def _make_cache_key(self, endpoint: str, params: Optional[Dict] = None) -> str:
        """Generate cache key from endpoint and params."""
        cache_data = f"{self.base_url}:{endpoint}:{json.dumps(params or {}, sort_keys=True)}"
        return hashlib.md5(cache_data.encode()).hexdigest()
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "X-Emby-Token": self.api_key,
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Emby."""
        try:
            info = await self.get("/System/Info")
            return {
                "success": True,
                "message": "Connection successful",
                "version": info.get("Version", "unknown")
            }
        except ServiceClientError as e:
            return {
                "success": False,
                "message": str(e.message),
                "version": None
            }
    
    async def get_users(self) -> List[Dict[str, Any]]:
        """Get all users."""
        return await self.get("/Users")
    
    async def get_libraries(self) -> List[Dict[str, Any]]:
        """Get all libraries (views) - cached for 10 minutes."""
        cache_key = self._make_cache_key("/Library/VirtualFolders")
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for libraries")
            return cached
        
        result = await self.get("/Library/VirtualFolders")
        libraries = result if result else []
        self.cache.set(cache_key, libraries, ttl=600)  # 10 minutes
        return libraries
    
    async def get_items(
        self,
        parent_id: Optional[str] = None,
        include_item_types: Optional[List[str]] = None,
        recursive: bool = True,
        fields: Optional[List[str]] = None,
        use_cache: bool = True,
        cache_ttl: int = 300
    ) -> List[Dict[str, Any]]:
        """Get library items - cached by default for 5 minutes."""
        params = {
            "Recursive": str(recursive).lower(),
        }
        if parent_id:
            params["ParentId"] = parent_id
        if include_item_types:
            params["IncludeItemTypes"] = ",".join(include_item_types)
        if fields:
            params["Fields"] = ",".join(fields)
        
        if use_cache:
            cache_key = self._make_cache_key("/Items", params)
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.debug(f"Cache hit for items (types={include_item_types})")
                return cached
        
        result = await self.get("/Items", params=params)
        items = result.get("Items", []) if result else []
        
        if use_cache:
            self.cache.set(cache_key, items, ttl=cache_ttl)
        
        return items
    
    async def get_movies(self, fields: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Get all movies."""
        default_fields = ["Path", "Overview", "Genres", "Tags", "DateCreated", "PremiereDate", "CommunityRating"]
        return await self.get_items(
            include_item_types=["Movie"],
            fields=fields or default_fields
        )
    
    async def get_series(self, fields: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Get all series."""
        default_fields = ["Path", "Overview", "Genres", "Tags", "DateCreated", "PremiereDate", "CommunityRating"]
        return await self.get_items(
            include_item_types=["Series"],
            fields=fields or default_fields
        )
    
    async def get_episodes(self, series_id: str, fields: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Get episodes for a series."""
        default_fields = ["Path", "DateCreated", "PremiereDate"]
        return await self.get_items(
            parent_id=series_id,
            include_item_types=["Episode"],
            fields=fields or default_fields
        )
    
    async def get_item_by_id(self, item_id: str) -> Dict[str, Any]:
        """Get a specific item by ID."""
        return await self.get(f"/Items/{item_id}")
    
    async def get_user_data(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Get user data for an item (played status, play count, etc.)."""
        return await self.get(f"/Users/{user_id}/Items/{item_id}")
    
    async def get_playback_info(self, user_id: str, item_id: str) -> Dict[str, Any]:
        """Get playback information for an item."""
        return await self.get(f"/Items/{item_id}/PlaybackInfo", params={"userId": user_id})
    
    async def get_activity_log(
        self,
        start_index: int = 0,
        limit: int = 100,
        min_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get activity log entries."""
        params = {
            "StartIndex": start_index,
            "Limit": limit
        }
        if min_date:
            params["MinDate"] = min_date
        
        result = await self.get("/System/ActivityLog/Entries", params=params)
        return result.get("Items", []) if result else []
    
    async def get_sessions(self) -> List[Dict[str, Any]]:
        """Get active sessions (currently watching)."""
        return await self.get("/Sessions")
    
    async def get_play_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get play statistics."""
        params = {}
        if user_id:
            params["userId"] = user_id
        return await self.get("/user_usage_stats/PlayActivity", params=params)
    
    async def is_item_being_watched(self, item_id: str) -> bool:
        """Check if an item is currently being watched - cached for 30 seconds."""
        cache_key = self._make_cache_key("/Sessions", {"check_item": item_id})
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached
        
        sessions = await self.get_sessions()
        is_watching = False
        for session in sessions:
            now_playing = session.get("NowPlayingItem", {})
            if now_playing.get("Id") == item_id:
                is_watching = True
                break
            # Also check for series/season if episode is playing
            if now_playing.get("SeriesId") == item_id or now_playing.get("SeasonId") == item_id:
                is_watching = True
                break
        
        self.cache.set(cache_key, is_watching, ttl=30)  # 30 seconds for active sessions
        return is_watching
    
    async def get_item_play_history(self, item_id: str) -> List[Dict[str, Any]]:
        """Get play history for an item."""
        try:
            # Try to use playback reporting plugin if available
            result = await self.get(f"/user_usage_stats/item/{item_id}/playback")
            return result if result else []
        except ServiceClientError:
            # Fallback - no playback reporting plugin
            return []
    
    async def get_all_user_watch_data(self, user_id: str, item_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get watch data for multiple items at once.
        Returns dict with item_id as key and watch data as value.
        """
        result = {}
        # Batch requests in chunks of 50
        for i in range(0, len(item_ids), 50):
            chunk = item_ids[i:i+50]
            for item_id in chunk:
                try:
                    data = await self.get_user_data(user_id, item_id)
                    user_data = data.get("UserData", {})
                    result[item_id] = {
                        "is_watched": user_data.get("Played", False),
                        "play_count": user_data.get("PlayCount", 0),
                        "is_favorite": user_data.get("IsFavorite", False),
                        "progress_percent": user_data.get("PlayedPercentage", 0),
                        "last_played_date": user_data.get("LastPlayedDate"),
                        "playback_position_ticks": user_data.get("PlaybackPositionTicks", 0),
                    }
                except ServiceClientError:
                    pass
        return result
    
    async def get_items_with_watch_data(
        self,
        user_id: str,
        parent_id: Optional[str] = None,
        include_item_types: Optional[List[str]] = None,
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get library items with full watch data in a single request.
        This is more efficient than fetching items and watch data separately.
        """
        default_fields = [
            "Path", "Overview", "Genres", "Tags", "DateCreated", "PremiereDate",
            "CommunityRating", "Size", "MediaSources", "RunTimeTicks",
            # Include UserData fields
        ]
        # Merge custom fields if provided
        if fields:
            all_fields = list(set(default_fields + fields))
        else:
            all_fields = default_fields
            
        params = {
            "Recursive": "true",
            "Fields": ",".join(all_fields),
            "EnableUserData": "true",  # Include UserData in response
        }
        if parent_id:
            params["ParentId"] = parent_id
        if include_item_types:
            params["IncludeItemTypes"] = ",".join(include_item_types)
        
        result = await self.get(f"/Users/{user_id}/Items", params=params)
        return result.get("Items", []) if result else []
    
    async def get_recently_played(
        self,
        user_id: str,
        limit: int = 100,
        include_item_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get recently played items for a user."""
        params = {
            "Limit": limit,
            "SortBy": "DatePlayed",
            "SortOrder": "Descending",
            "Filters": "IsPlayed",
            "Recursive": "true",
            "EnableUserData": "true",
        }
        if include_item_types:
            params["IncludeItemTypes"] = ",".join(include_item_types)
        
        result = await self.get(f"/Users/{user_id}/Items", params=params)
        return result.get("Items", []) if result else []
    
    async def get_in_progress_items(
        self,
        user_id: str,
        include_item_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get items that are in progress (started but not finished)."""
        params = {
            "SortBy": "DatePlayed",
            "SortOrder": "Descending",
            "Filters": "IsResumable",
            "Recursive": "true",
            "EnableUserData": "true",
        }
        if include_item_types:
            params["IncludeItemTypes"] = ",".join(include_item_types)
        
        result = await self.get(f"/Users/{user_id}/Items", params=params)
        return result.get("Items", []) if result else []
    
    async def is_user_favorite(self, user_id: str, item_id: str) -> bool:
        """Check if an item is marked as favorite by a user."""
        try:
            user_data = await self.get_user_data(user_id, item_id)
            return user_data.get("UserData", {}).get("IsFavorite", False)
        except ServiceClientError:
            return False
    
    async def delete_item(self, item_id: str) -> None:
        """Delete an item from Emby."""
        await self.delete(f"/Items/{item_id}")
        logger.info(f"Deleted item {item_id} from Emby")
    
    async def create_library(
        self,
        name: str,
        paths: List[str],
        library_type: str = "mixed",
        refresh_library: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new library.
        
        Args:
            name: Library name
            paths: List of folder paths for the library
            library_type: Type of library (movies, tvshows, mixed, music, etc.)
            refresh_library: Whether to refresh library after creation
            
        Returns:
            Dict with library info including ItemId
        """
        data = {
            "Name": name,
            "Paths": paths,
            "CollectionType": library_type if library_type != "mixed" else None,
            "LibraryOptions": {
                "EnablePhotos": False,
                "EnableRealtimeMonitor": True,
                "EnableChapterImageExtraction": False,
                "ExtractChapterImagesDuringLibraryScan": False,
                "EnableInternetProviders": True,
                "EnableAutomaticSeriesGrouping": True,
                "SaveLocalMetadata": False,
                "PathInfos": [{"Path": path} for path in paths]
            }
        }
        
        result = await self.post("/Library/VirtualFolders", params={"name": name}, json=data)
        logger.info(f"Created library '{name}' at paths: {paths}")
        
        # Get library ID
        libraries = await self.get_libraries()
        library = next((lib for lib in libraries if lib.get("Name") == name), None)
        
        if library and refresh_library:
            # Trigger library scan
            library_id = library.get("ItemId")
            if library_id:
                await self.refresh_library(library_id)
        
        return library or {"Name": name, "Paths": paths}
    
    async def delete_library(self, name: str) -> None:
        """Delete a library by name."""
        await self.delete("/Library/VirtualFolders", params={"name": name})
        logger.info(f"Deleted library '{name}'")
    
    async def get_library_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get library by name."""
        libraries = await self.get_libraries()
        return next((lib for lib in libraries if lib.get("Name") == name), None)
    
    async def refresh_library(self, library_id: str) -> None:
        """Trigger a library refresh/scan."""
        await self.post(f"/Items/{library_id}/Refresh", json={"Recursive": True})
        logger.info(f"Triggered refresh for library {library_id}")
    
    async def ensure_staging_library(
        self,
        library_name: str,
        staging_path: str
    ) -> Optional[str]:
        """
        Ensure staging library exists, create if not.
        
        Args:
            library_name: Name for the staging library
            staging_path: Path to staging directory
            
        Returns:
            Library ItemId or None if failed
        """
        # Check if library exists
        library = await self.get_library_by_name(library_name)
        
        if library:
            library_id = library.get("ItemId")
            logger.info(f"Staging library '{library_name}' already exists with ID {library_id}")
            return library_id
        
        # Create library
        try:
            library = await self.create_library(
                name=library_name,
                paths=[staging_path],
                library_type="mixed",  # Support both movies and series
                refresh_library=True
            )
            library_id = library.get("ItemId")
            logger.info(f"Created staging library '{library_name}' with ID {library_id}")
            return library_id
        except ServiceClientError as e:
            logger.error(f"Failed to create staging library: {e}")
            return None


class EmbyService:
    """High-level service for Emby operations with database integration."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self._clients: Dict[int, EmbyClient] = {}
    
    async def get_client(self, service_id: int) -> Optional[EmbyClient]:
        """Get Emby client for a service connection."""
        # Check cache
        if service_id in self._clients:
            return self._clients[service_id]
        
        # Load from database
        result = await self.db.execute(
            select(ServiceConnection).where(
                ServiceConnection.id == service_id,
                ServiceConnection.service_type == "emby",
                ServiceConnection.is_enabled == True
            )
        )
        service = result.scalar_one_or_none()
        
        if not service:
            return None
        
        # Create client
        client = EmbyClient(service.url, service.api_key)
        self._clients[service_id] = client
        return client
    
    async def get_primary_emby_service(self) -> Optional[ServiceConnection]:
        """Get the primary Emby service connection."""
        result = await self.db.execute(
            select(ServiceConnection).where(
                ServiceConnection.service_type == "emby",
                ServiceConnection.is_enabled == True
            ).order_by(ServiceConnection.created_at.asc())
        )
        return result.scalar_one_or_none()
    
    async def ensure_staging_library(
        self,
        library_name: str,
        staging_path: str
    ) -> Optional[str]:
        """Ensure staging library exists on primary Emby service."""
        service = await self.get_primary_emby_service()
        if not service:
            logger.error("No Emby service configured")
            return None
        
        client = await self.get_client(service.id)
        if not client:
            return None
        
        return await client.ensure_staging_library(library_name, staging_path)
    
    async def refresh_staging_library(self, library_id: str) -> bool:
        """Refresh staging library on primary Emby service."""
        service = await self.get_primary_emby_service()
        if not service:
            return False
        
        client = await self.get_client(service.id)
        if not client:
            return False
        
        try:
            await client.refresh_library(library_id)
            return True
        except ServiceClientError as e:
            logger.error(f"Failed to refresh staging library: {e}")
            return False

