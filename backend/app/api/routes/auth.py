"""
Authentication API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from typing import List

from ...core.database import get_db
from ...core.security import hash_password, verify_password, create_access_token
from ...core.config import get_settings
from ...models import User
from ...schemas import Token, UserCreate, UserResponse, UserUpdate
from ..deps import get_current_user, get_current_active_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


@router.get("/setup-required")
async def check_setup_required(
    db: AsyncSession = Depends(get_db)
):
    """Check if initial setup is required (no users exist)."""
    result = await db.execute(select(User).limit(1))
    user_exists = result.scalar_one_or_none() is not None
    return {"setup_required": not user_exists}


@router.post("/login", response_model=Token)
async def login(
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
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user (first user becomes admin)."""
    # Check if any users exist
    result = await db.execute(select(User).limit(1))
    existing_user = result.scalar_one_or_none()
    
    # Check if username is taken
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email is taken
    if user_data.email:
        result = await db.execute(
            select(User).where(User.email == user_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
    
    # Create user (first user is admin)
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        is_admin=existing_user is None,  # First user is admin
        is_active=True
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
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


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)."""
    result = await db.execute(select(User))
    return result.scalars().all()


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself"
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    await db.delete(user)
    await db.commit()
    
    return {"message": "User deleted"}
