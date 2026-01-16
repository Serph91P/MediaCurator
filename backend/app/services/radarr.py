"""
Radarr API client for movie management.
"""
from typing import Dict, Any, List
from .base import BaseServiceClient, ServiceClientError
from loguru import logger


class RadarrClient(BaseServiceClient):
    """Client for Radarr API v3."""
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Radarr."""
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
    
    async def get_movies(self) -> List[Dict[str, Any]]:
        """Get all movies."""
        return await self.get("/api/v3/movie")
    
    async def get_movie_by_id(self, movie_id: int) -> Dict[str, Any]:
        """Get a specific movie by ID."""
        return await self.get(f"/api/v3/movie/{movie_id}")
    
    async def delete_movie(self, movie_id: int, delete_files: bool = True, add_exclusion: bool = False) -> None:
        """Delete a movie."""
        params = f"deleteFiles={str(delete_files).lower()}&addImportExclusion={str(add_exclusion).lower()}"
        await self.delete(f"/api/v3/movie/{movie_id}?{params}")
        logger.info(f"Deleted movie {movie_id} from Radarr")
    
    async def unmonitor_movie(self, movie_id: int) -> Dict[str, Any]:
        """Unmonitor a movie."""
        movie = await self.get_movie_by_id(movie_id)
        movie["monitored"] = False
        return await self.put(f"/api/v3/movie/{movie_id}", json=movie)
    
    async def get_movie_files(self) -> List[Dict[str, Any]]:
        """Get all movie files."""
        return await self.get("/api/v3/moviefile")
    
    async def delete_movie_file(self, movie_file_id: int) -> None:
        """Delete a movie file."""
        await self.delete(f"/api/v3/moviefile/{movie_file_id}")
        logger.info(f"Deleted movie file {movie_file_id} from Radarr")
    
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
    
    async def get_exclusions(self) -> List[Dict[str, Any]]:
        """Get import list exclusions."""
        return await self.get("/api/v3/exclusions")
    
    async def add_exclusion(self, tmdb_id: int, title: str, year: int) -> Dict[str, Any]:
        """Add movie to import list exclusions."""
        return await self.post("/api/v3/exclusions", json={
            "tmdbId": tmdb_id,
            "movieTitle": title,
            "movieYear": year
        })
    
    async def get_history(self, movie_id: int = None, page: int = 1, page_size: int = 50) -> Dict[str, Any]:
        """Get history records."""
        params = {"page": page, "pageSize": page_size}
        if movie_id:
            params["movieId"] = movie_id
        return await self.get("/api/v3/history", params=params)
