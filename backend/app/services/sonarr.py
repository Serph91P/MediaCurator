"""
Sonarr API client for series management.
"""
from typing import Dict, Any, List, Optional
from .base import BaseServiceClient, ServiceClientError
from loguru import logger


class SonarrClient(BaseServiceClient):
    """Client for Sonarr API v3."""
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Sonarr."""
        try:
            status = await self.get("/api/v3/system/status")
            return {
                "success": True,
                "message": "Connection successful",
                "version": status.get("version", "unknown")
            }
        except ServiceClientError as e:
            return {
                "success": False,
                "message": str(e.message),
                "version": None
            }
    
    async def get_series(self) -> List[Dict[str, Any]]:
        """Get all series."""
        return await self.get("/api/v3/series")
    
    async def get_series_by_id(self, series_id: int) -> Dict[str, Any]:
        """Get a specific series by ID."""
        return await self.get(f"/api/v3/series/{series_id}")
    
    async def get_episodes(self, series_id: int) -> List[Dict[str, Any]]:
        """Get all episodes for a series."""
        return await self.get("/api/v3/episode", params={"seriesId": series_id})
    
    async def get_episode_files(self, series_id: int) -> List[Dict[str, Any]]:
        """Get episode files for a series."""
        return await self.get("/api/v3/episodefile", params={"seriesId": series_id})
    
    async def delete_episode_file(self, episode_file_id: int) -> None:
        """Delete an episode file."""
        await self.delete(f"/api/v3/episodefile/{episode_file_id}")
        logger.info(f"Deleted episode file {episode_file_id} from Sonarr")
    
    async def delete_series(self, series_id: int, delete_files: bool = True) -> None:
        """Delete a series."""
        await self.delete(f"/api/v3/series/{series_id}?deleteFiles={str(delete_files).lower()}")
        logger.info(f"Deleted series {series_id} from Sonarr")
    
    async def unmonitor_series(self, series_id: int) -> Dict[str, Any]:
        """Unmonitor a series."""
        series = await self.get_series_by_id(series_id)
        series["monitored"] = False
        return await self.put(f"/api/v3/series/{series_id}", json=series)
    
    async def unmonitor_episode(self, episode_id: int) -> Dict[str, Any]:
        """Unmonitor an episode."""
        episode = await self.get(f"/api/v3/episode/{episode_id}")
        episode["monitored"] = False
        return await self.put(f"/api/v3/episode/{episode_id}", json=episode)
    
    async def get_tags(self) -> List[Dict[str, Any]]:
        """Get all tags."""
        return await self.get("/api/v3/tag")
    
    async def get_quality_profiles(self) -> List[Dict[str, Any]]:
        """Get quality profiles."""
        return await self.get("/api/v3/qualityprofile")
    
    async def get_disk_space(self) -> List[Dict[str, Any]]:
        """Get disk space information."""
        return await self.get("/api/v3/diskspace")
    
    async def get_root_folders(self) -> List[Dict[str, Any]]:
        """Get root folders."""
        return await self.get("/api/v3/rootfolder")
    
    async def get_import_list_exclusions(self) -> List[Dict[str, Any]]:
        """Get import list exclusions."""
        return await self.get("/api/v3/importlistexclusion")
    
    async def add_import_list_exclusion(self, tvdb_id: int, title: str) -> Dict[str, Any]:
        """Add series to import list exclusions."""
        return await self.post("/api/v3/importlistexclusion", json={
            "tvdbId": tvdb_id,
            "title": title
        })
    
    async def get_history(self, series_id: int = None, episode_id: int = None, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """Get history records."""
        params = {"page": page, "pageSize": page_size}
        if series_id:
            params["seriesId"] = series_id
        if episode_id:
            params["episodeId"] = episode_id
        return await self.get("/api/v3/history", params=params)
    
    async def unmonitor_season(self, series_id: int, season_number: int) -> Dict[str, Any]:
        """Unmonitor a specific season."""
        series = await self.get_series_by_id(series_id)
        for season in series.get("seasons", []):
            if season["seasonNumber"] == season_number:
                season["monitored"] = False
        return await self.put(f"/api/v3/series/{series_id}", json=series)
