"""
Authentication dependencies and utilities.
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from ..core.database import get_db
from ..core.security import decode_token
from ..core.security_events import log_security_event, SecurityEventType
from ..models import User

# auto_error=False allows cookie-based auth fallback
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get the current authenticated user from httpOnly cookie or Authorization header."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try httpOnly cookie first, then Authorization header
    token = request.cookies.get("access_token")
    if not token and credentials:
        token = credentials.credentials
    
    if not token:
        raise credentials_exception
    
    token_data = decode_token(token)
    
    if token_data is None or token_data.user_id is None:
        log_security_event(
            SecurityEventType.AUTHZ_INVALID_TOKEN,
            client_ip=request.client.host if request.client else "unknown",
            path=str(request.url.path),
            method=request.method,
            detail="Token decode failed or missing user_id",
        )
        raise credentials_exception
    
    result = await db.execute(
        select(User).where(User.id == token_data.user_id)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        log_security_event(
            SecurityEventType.AUTHZ_INVALID_TOKEN,
            client_ip=request.client.host if request.client else "unknown",
            path=str(request.url.path),
            method=request.method,
            detail="User not found for token",
        )
        raise credentials_exception
    
    if not user.is_active:
        log_security_event(
            SecurityEventType.AUTHZ_DENIED,
            client_ip=request.client.host if request.client else "unknown",
            user_id=user.id,
            username=user.username,
            path=str(request.url.path),
            method=request.method,
            detail="Inactive user attempted access",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    
    return user


async def get_current_active_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get the current user and verify they are an admin."""
    if not current_user.is_admin:
        log_security_event(
            SecurityEventType.AUTHZ_ADMIN_REQUIRED,
            user_id=current_user.id,
            username=current_user.username,
            detail="Non-admin user attempted admin action",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Get the current user if authenticated, None otherwise."""
    # Try httpOnly cookie first, then Authorization header
    token = request.cookies.get("access_token")
    if not token and credentials:
        token = credentials.credentials
    
    if not token:
        return None
    
    token_data = decode_token(token)
    if token_data is None or token_data.user_id is None:
        return None
    
    result = await db.execute(
        select(User).where(User.id == token_data.user_id)
    )
    return result.scalar_one_or_none()
