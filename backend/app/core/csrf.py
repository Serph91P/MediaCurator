"""
CSRF double-submit cookie protection middleware.

Sets a non-httpOnly CSRF cookie on responses that set auth cookies,
and validates the X-CSRF-Token header against the cookie on state-changing requests.
"""
import secrets

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from .config import get_settings
from .security_events import log_security_event, SecurityEventType

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_EXEMPT_PATHS = frozenset({"/api/auth/login", "/api/auth/register"})


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response: Response, token: str) -> None:
    """Set a non-httpOnly CSRF cookie (readable by JavaScript)."""
    settings = get_settings()
    is_secure = not settings.debug
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=is_secure,
        samesite="lax",
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )


def clear_csrf_cookie(response: Response) -> None:
    """Clear the CSRF cookie."""
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Validates CSRF double-submit cookie on state-changing requests.

    For POST/PUT/PATCH/DELETE requests to /api/* paths,
    the X-CSRF-Token header must match the csrf_token cookie.
    Login/register are exempt (no cookie exists yet).
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method not in SAFE_METHODS and request.url.path.startswith("/api"):
            if request.url.path not in CSRF_EXEMPT_PATHS:
                cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
                header_token = request.headers.get(CSRF_HEADER_NAME)

                if not cookie_token or not header_token:
                    from fastapi.responses import JSONResponse
                    log_security_event(
                        SecurityEventType.CSRF_VIOLATION,
                        client_ip=request.client.host if request.client else "unknown",
                        path=str(request.url.path),
                        method=request.method,
                        detail="CSRF token missing",
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token missing"},
                    )

                if not secrets.compare_digest(cookie_token, header_token):
                    from fastapi.responses import JSONResponse
                    log_security_event(
                        SecurityEventType.CSRF_VIOLATION,
                        client_ip=request.client.host if request.client else "unknown",
                        path=str(request.url.path),
                        method=request.method,
                        detail="CSRF token mismatch",
                    )
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "CSRF token invalid"},
                    )

        return await call_next(request)
