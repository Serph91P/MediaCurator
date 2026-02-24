"""
Rate limiting configuration for API endpoints.

Uses slowapi for rate limiting with in-memory storage.
Provides different rate limits for different endpoint types.
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request, Response
from typing import Optional, Callable, Union
from loguru import logger


def get_client_ip(request: Request) -> str:
    """
    Get client IP address from request.
    Only trusts X-Forwarded-For when the direct client is a configured trusted proxy.
    """
    from .config import get_settings
    settings = get_settings()
    trusted_proxies = settings.trusted_proxy_list
    direct_ip = request.client.host if request.client else "unknown"

    if trusted_proxies and direct_ip in trusted_proxies:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()

    return direct_ip


def get_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key based on client IP.
    Can be extended to use user ID for authenticated requests.
    """
    return get_client_ip(request)


def get_authenticated_rate_limit_key(request: Request) -> str:
    """
    Generate rate limit key that considers authenticated user.
    Falls back to IP if not authenticated.
    """
    # Try to get user from request state (set by auth middleware)
    user = getattr(request.state, "user", None)
    if user and hasattr(user, "id"):
        return f"user:{user.id}"
    
    return get_client_ip(request)


# Create the limiter instance with IP-based key function
limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["200/minute"],  # Default: 200 requests per minute
    storage_uri="memory://",  # In-memory storage (sufficient for single instance)
    strategy="fixed-window",  # Fixed window strategy
)


# Rate limit presets for different endpoint types
class RateLimits:
    """
    Predefined rate limit strings for different endpoint types.
    Format: "X/period" where period can be: second, minute, hour, day
    """
    
    # Auth endpoints - strict limits to prevent brute force
    AUTH_LOGIN = "5/minute"  # 5 login attempts per minute
    AUTH_REGISTER = "3/minute"  # 3 registration attempts per minute
    AUTH_PASSWORD_RESET = "3/minute"  # 3 password reset attempts per minute
    
    # Standard API endpoints
    API_READ = "100/minute"  # Read operations (GET)
    API_WRITE = "30/minute"  # Write operations (POST, PUT, DELETE)
    
    # Expensive operations
    SYNC_OPERATION = "5/minute"  # Sync operations (can be resource intensive)
    TEST_OPERATION = "10/minute"  # Test operations (notifications, connections)
    CLEANUP_OPERATION = "5/minute"  # Cleanup/delete operations
    
    # Bulk operations
    BULK_OPERATION = "10/minute"  # Bulk imports, exports
    
    # Health checks - more lenient for monitoring
    HEALTH_CHECK = "60/minute"  # Health check endpoints


def create_rate_limit_response(request: Request, exc: RateLimitExceeded) -> Response:
    """
    Custom rate limit exceeded response handler.
    Returns a JSON response with rate limit details.
    """
    from fastapi.responses import JSONResponse
    
    # Extract retry-after from the exception
    retry_after = getattr(exc, "retry_after", 60)
    
    logger.warning(
        f"Rate limit exceeded for {get_client_ip(request)} on {request.url.path}"
    )
    
    response = JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": f"Rate limit exceeded. Please try again in {retry_after} seconds.",
            "retry_after": retry_after,
            "detail": str(exc.detail) if hasattr(exc, "detail") else "Too many requests"
        }
    )
    
    # Add Retry-After header
    response.headers["Retry-After"] = str(retry_after)
    response.headers["X-RateLimit-Limit"] = str(exc.detail) if hasattr(exc, "detail") else "unknown"
    
    return response


def setup_rate_limiting(app):
    """
    Setup rate limiting for the FastAPI application.
    
    Args:
        app: FastAPI application instance
    """
    # Set the limiter instance on app state
    app.state.limiter = limiter
    
    # Add rate limit exceeded handler
    app.add_exception_handler(RateLimitExceeded, create_rate_limit_response)
    
    # Add SlowAPI middleware
    app.add_middleware(SlowAPIMiddleware)
    
    logger.info("Rate limiting configured")
