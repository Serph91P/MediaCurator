"""
Emby API client for media server interaction.
"""
from typing import Dict, Any, List, Optional
from .base import BaseServiceClient, ServiceClientError
from loguru import logger


class EmbyClient(BaseServiceClient):
    """Client for Emby API."""
    
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
        """Get all libraries (views)."""
        result = await self.get("/Library/VirtualFolders")
        return result if result else []
    
    async def get_items(
        self,
        parent_id: Optional[str] = None,
        include_item_types: Optional[List[str]] = None,
        recursive: bool = True,
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get library items."""
        params = {
            "Recursive": str(recursive).lower(),
        }
        if parent_id:
            params["ParentId"] = parent_id
        if include_item_types:
            params["IncludeItemTypes"] = ",".join(include_item_types)
        if fields:
            params["Fields"] = ",".join(fields)
        
        result = await self.get("/Items", params=params)
        return result.get("Items", []) if result else []
    
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
        """Check if an item is currently being watched."""
        sessions = await self.get_sessions()
        for session in sessions:
            now_playing = session.get("NowPlayingItem", {})
            if now_playing.get("Id") == item_id:
                return True
            # Also check for series/season if episode is playing
            if now_playing.get("SeriesId") == item_id or now_playing.get("SeasonId") == item_id:
                return True
        return False
    
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
        include_item_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get library items with full watch data in a single request.
        This is more efficient than fetching items and watch data separately.
        """
        fields = [
            "Path", "Overview", "Genres", "Tags", "DateCreated", "PremiereDate",
            "CommunityRating", "Size", "MediaSources",
            # Include UserData fields
        ]
        params = {
            "Recursive": "true",
            "Fields": ",".join(fields),
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
