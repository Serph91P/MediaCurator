"""
Authentication API routes.
"""
from fastapi import APIRouter, Body, Depends, HTTPException, Response, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timezone
from typing import List, Optional

from ...core.database import get_db
from ...core.security import (
    hash_password, verify_password, create_access_token, 
    create_refresh_token, create_token_pair
)
from ...core.config import get_settings
from ...core.rate_limit import limiter, RateLimits
from ...core.csrf import generate_csrf_token, set_csrf_cookie, clear_csrf_cookie
from ...core.security_events import log_security_event, SecurityEventType
from ...models import User, RefreshToken
from ...schemas import (
    Token, TokenRefreshRequest, TokenRefreshResponse,
    UserCreate, UserResponse, UserUpdate,
    SessionInfo, SessionListResponse
)
from ..deps import get_current_user, get_current_active_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set httpOnly auth cookies and CSRF cookie on the response."""
    is_secure = not settings.debug
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        path="/api",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="strict",
        path="/api/auth",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )
    set_csrf_cookie(response, generate_csrf_token())


def _clear_auth_cookies(response: Response) -> None:
    """Clear httpOnly auth cookies and CSRF cookie from the response."""
    response.delete_cookie("access_token", path="/api")
    response.delete_cookie("refresh_token", path="/api/auth")
    clear_csrf_cookie(response)


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request, trusting proxies only if configured."""
    trusted_proxies = settings.trusted_proxy_list
    direct_ip = request.client.host if request.client else "unknown"

    if trusted_proxies and direct_ip in trusted_proxies:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

    return direct_ip


def get_device_info(request: Request) -> str:
    """Extract device info from User-Agent header."""
    user_agent = request.headers.get("user-agent", "Unknown Device")
    # Truncate if too long
    return user_agent[:255] if len(user_agent) > 255 else user_agent


@router.get("/setup-required")
@limiter.limit(RateLimits.API_READ)
async def check_setup_required(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Check if initial setup is required (no users exist)."""
    result = await db.execute(select(User).limit(1))
    user_exists = result.scalar_one_or_none() is not None
    return {"setup_required": not user_exists}


@router.post("/login", response_model=Token)
@limiter.limit(RateLimits.AUTH_LOGIN)
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Login and get access and refresh tokens."""
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_DURATION_MINUTES = 15

    result = await db.execute(
        select(User).where(User.username == form_data.username)
    )
    user = result.scalar_one_or_none()

    if user and user.locked_until:
        lock_time = user.locked_until
        if lock_time.tzinfo is None:
            lock_time = lock_time.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < lock_time:
            log_security_event(
                SecurityEventType.AUTH_LOGIN_FAILURE,
                client_ip=get_client_ip(request),
                username=form_data.username,
                path="/api/auth/login",
                method="POST",
                detail="Account locked",
            )
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account temporarily locked due to too many failed login attempts. Try again later.",
            )
        user.failed_login_attempts = 0
        user.locked_until = None
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
                from datetime import timedelta
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                log_security_event(
                    SecurityEventType.AUTH_ACCOUNT_LOCKED,
                    client_ip=get_client_ip(request),
                    user_id=user.id,
                    username=user.username,
                    path="/api/auth/login",
                    method="POST",
                    detail=f"Account locked after {MAX_FAILED_ATTEMPTS} failed attempts",
                )
            await db.commit()
        log_security_event(
            SecurityEventType.AUTH_LOGIN_FAILURE,
            client_ip=get_client_ip(request),
            username=form_data.username,
            path="/api/auth/login",
            method="POST",
            detail="Incorrect username or password",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    
    # Create access and refresh tokens
    access_token, refresh_token, refresh_expires = create_token_pair(
        user_id=user.id, 
        username=user.username
    )
    
    # Store refresh token in database
    db_refresh_token = RefreshToken(
        token=refresh_token,
        user_id=user.id,
        expires_at=refresh_expires,
        device_info=get_device_info(request),
        ip_address=get_client_ip(request)
    )
    db.add(db_refresh_token)
    await db.commit()
    
    _set_auth_cookies(response, access_token, refresh_token)
    
    log_security_event(
        SecurityEventType.AUTH_LOGIN_SUCCESS,
        client_ip=get_client_ip(request),
        user_id=user.id,
        username=user.username,
        path="/api/auth/login",
        method="POST",
    )
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60
    )


@router.post("/register", response_model=UserResponse)
@limiter.limit(RateLimits.AUTH_REGISTER)
async def register(
    request: Request,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register the admin user (only allowed if no users exist)."""
    # Check if any users exist - only allow registration if no users exist
    result = await db.execute(select(User).limit(1))
    existing_user = result.scalar_one_or_none()
    
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled. Admin user already exists."
        )
    
    # Create the admin user (first and only user)
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        is_admin=True,
        is_active=True
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    log_security_event(
        SecurityEventType.AUTH_REGISTER,
        client_ip=get_client_ip(request),
        user_id=user.id,
        username=user.username,
        path="/api/auth/register",
        method="POST",
    )
    
    return user


@router.get("/me", response_model=UserResponse)
@limiter.limit(RateLimits.API_READ)
async def get_current_user_info(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
@limiter.limit(RateLimits.API_WRITE)
async def update_current_user(
    request: Request,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user information."""
    if user_data.username and user_data.username != current_user.username:
        result = await db.execute(
            select(User).where(User.username == user_data.username)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.username = user_data.username
    
    if user_data.email and user_data.email != current_user.email:
        result = await db.execute(
            select(User).where(User.email == user_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already taken"
            )
        current_user.email = user_data.email
    
    if user_data.password:
        current_user.hashed_password = hash_password(user_data.password)
    
    await db.commit()
    await db.refresh(current_user)
    
    return current_user


@router.post("/refresh", response_model=TokenRefreshResponse)
@limiter.limit(RateLimits.AUTH_LOGIN)
async def refresh_token(
    request: Request,
    response: Response,
    token_request: Optional[TokenRefreshRequest] = Body(None),
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using a valid refresh token. Rotates the refresh token."""
    # Read refresh token from cookie first, fall back to request body
    refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value and token_request:
        refresh_token_value = token_request.refresh_token
    
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Find the refresh token in database
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token == refresh_token_value)
    )
    db_token = result.scalar_one_or_none()
    
    if not db_token:
        log_security_event(
            SecurityEventType.AUTH_TOKEN_REFRESH_FAILURE,
            client_ip=get_client_ip(request),
            path="/api/auth/refresh",
            method="POST",
            detail="Invalid refresh token",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if token is valid
    if not db_token.is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired or revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get the user
    user_result = await db.execute(
        select(User).where(User.id == db_token.user_id)
    )
    user = user_result.scalar_one_or_none()
    
    if not user or not user.is_active:
        db_token.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Revoke old refresh token
    db_token.revoked_at = datetime.now(timezone.utc)

    # Create new access + refresh token pair
    access_token, new_refresh_token, refresh_expires = create_token_pair(
        user_id=user.id,
        username=user.username
    )

    # Store the new refresh token
    new_db_token = RefreshToken(
        token=new_refresh_token,
        user_id=user.id,
        expires_at=refresh_expires,
        device_info=db_token.device_info,
        ip_address=get_client_ip(request)
    )
    db.add(new_db_token)
    await db.commit()
    
    _set_auth_cookies(response, access_token, new_refresh_token)
    
    log_security_event(
        SecurityEventType.AUTH_TOKEN_REFRESH,
        client_ip=get_client_ip(request),
        user_id=user.id,
        username=user.username,
        path="/api/auth/refresh",
        method="POST",
    )
    
    return TokenRefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.access_token_expire_minutes * 60
    )


@router.post("/logout")
@limiter.limit(RateLimits.API_WRITE)
async def logout(
    request: Request,
    response: Response,
    token_request: Optional[TokenRefreshRequest] = Body(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Logout and revoke the refresh token."""
    # Get refresh token from cookie or body
    refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value and token_request:
        refresh_token_value = token_request.refresh_token
    
    if refresh_token_value:
        result = await db.execute(
            select(RefreshToken).where(
                and_(
                    RefreshToken.token == refresh_token_value,
                    RefreshToken.user_id == current_user.id
                )
            )
        )
        db_token = result.scalar_one_or_none()
        
        if db_token:
            db_token.revoked_at = datetime.now(timezone.utc)
            await db.commit()
    
    _clear_auth_cookies(response)
    
    log_security_event(
        SecurityEventType.AUTH_LOGOUT,
        client_ip=get_client_ip(request),
        user_id=current_user.id,
        username=current_user.username,
        path="/api/auth/logout",
        method="POST",
    )
    
    return {"message": "Successfully logged out"}


@router.post("/logout-all")
@limiter.limit(RateLimits.API_WRITE)
async def logout_all_sessions(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Logout from all sessions by revoking all refresh tokens."""
    result = await db.execute(
        select(RefreshToken).where(
            and_(
                RefreshToken.user_id == current_user.id,
                RefreshToken.revoked_at.is_(None)
            )
        )
    )
    tokens = result.scalars().all()
    
    now = datetime.now(timezone.utc)
    for token in tokens:
        token.revoked_at = now
    
    await db.commit()
    
    _clear_auth_cookies(response)
    
    log_security_event(
        SecurityEventType.AUTH_LOGOUT_ALL,
        client_ip=get_client_ip(request),
        user_id=current_user.id,
        username=current_user.username,
        path="/api/auth/logout-all",
        method="POST",
        detail=f"Revoked {len(tokens)} sessions",
    )
    
    return {"message": f"Revoked {len(tokens)} active sessions"}


@router.get("/sessions", response_model=SessionListResponse)
@limiter.limit(RateLimits.API_READ)
async def list_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all active sessions for the current user."""
    # Get current refresh token from cookie or header
    current_token = request.cookies.get("refresh_token") or request.headers.get("x-refresh-token")
    
    result = await db.execute(
        select(RefreshToken).where(
            and_(
                RefreshToken.user_id == current_user.id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > datetime.now(timezone.utc)
            )
        ).order_by(RefreshToken.created_at.desc())
    )
    tokens = result.scalars().all()
    
    sessions = []
    for token in tokens:
        sessions.append(SessionInfo(
            id=token.id,
            device_info=token.device_info,
            ip_address=token.ip_address,
            created_at=token.created_at,
            expires_at=token.expires_at,
            is_current=(current_token == token.token if current_token else False)
        ))
    
    return SessionListResponse(sessions=sessions, total=len(sessions))


@router.delete("/sessions/{session_id}")
@limiter.limit(RateLimits.API_WRITE)
async def revoke_session(
    request: Request,
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Revoke a specific session by ID."""
    result = await db.execute(
        select(RefreshToken).where(
            and_(
                RefreshToken.id == session_id,
                RefreshToken.user_id == current_user.id
            )
        )
    )
    db_token = result.scalar_one_or_none()
    
    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    if db_token.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session already revoked"
        )
    
    db_token.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    
    return {"message": "Session revoked successfully"}


@router.post("/ws-token")
@limiter.limit(RateLimits.API_READ)
async def get_ws_token(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Get a short-lived token for WebSocket authentication (30 seconds)."""
    from ...core.security import create_ws_token
    token = create_ws_token(user_id=current_user.id, username=current_user.username)
    return {"token": token}

