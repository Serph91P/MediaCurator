"""
Authentication API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from typing import List

from ...core.database import get_db
from ...core.security import hash_password, verify_password, create_access_token
from ...core.config import get_settings
from ...core.rate_limit import limiter, RateLimits
from ...models import User
from ...schemas import Token, UserCreate, UserResponse, UserUpdate
from ..deps import get_current_user, get_current_active_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


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
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Login and get access token."""
    result = await db.execute(
        select(User).where(User.username == form_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
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
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username}
    )
    
    return Token(access_token=access_token)


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

