"""
Base class for all external service clients.
"""
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
import httpx
from loguru import logger


class ServiceClientError(Exception):
    """Exception raised by service clients."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class BaseServiceClient(ABC):
    """Base class for API clients."""
    
    def __init__(
        self,
        url: str,
        api_key: str,
        verify_ssl: bool = True,
        timeout: int = 30
    ):
        self.base_url = url.rstrip('/')
        self.api_key = api_key
        self.verify_ssl = verify_ssl
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                verify=self.verify_ssl,
                timeout=self.timeout,
                headers=self._get_headers()
            )
        return self._client
    
    @abstractmethod
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests."""
        pass
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Make an API request."""
        client = await self._get_client()
        try:
            response = await client.request(
                method=method,
                url=endpoint,
                params=params,
                json=json
            )
            response.raise_for_status()
            return response.json() if response.content else None
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error {e.response.status_code}: {e.response.text}")
            raise ServiceClientError(
                f"HTTP {e.response.status_code}: {e.response.text}",
                status_code=e.response.status_code
            )
        except httpx.RequestError as e:
            # Get more details about the connection error
            error_type = type(e).__name__
            error_msg = str(e) or repr(e)
            logger.error(f"Request error ({error_type}): {error_msg} - URL: {self.base_url}{endpoint}")
            raise ServiceClientError(f"Connection error ({error_type}): {error_msg}")
    
    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Make a GET request."""
        return await self._request("GET", endpoint, params=params)
    
    async def post(self, endpoint: str, json: Optional[Dict[str, Any]] = None) -> Any:
        """Make a POST request."""
        return await self._request("POST", endpoint, json=json)
    
    async def put(self, endpoint: str, json: Optional[Dict[str, Any]] = None) -> Any:
        """Make a PUT request."""
        return await self._request("PUT", endpoint, json=json)
    
    async def delete(self, endpoint: str) -> Any:
        """Make a DELETE request."""
        return await self._request("DELETE", endpoint)
    
    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """Test the connection to the service."""
        pass
