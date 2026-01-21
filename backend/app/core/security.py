"""
Security utilities for authentication and password hashing.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Union, Tuple
from jose import JWTError, jwt
from passlib.context import CryptContext
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from pydantic import BaseModel
import secrets
from .config import get_settings

settings = get_settings()

# Password hashing with Argon2 (more secure than bcrypt)
ph = PasswordHasher()

# Fallback context for bcrypt (for migration purposes)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenData(BaseModel):
    """Token payload data."""
    user_id: Optional[int] = None
    username: Optional[str] = None
    token_type: Optional[str] = None  # "access" or "refresh"


def hash_password(password: str) -> str:
    """Hash a password using Argon2."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    try:
        # Try Argon2 first
        if hashed_password.startswith("$argon2"):
            ph.verify(hashed_password, plain_password)
            return True
        # Fallback to bcrypt for old passwords
        return pwd_context.verify(plain_password, hashed_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({
        "exp": expire,
        "type": "access",
        "iat": datetime.now(timezone.utc)
    })
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def create_refresh_token() -> Tuple[str, datetime]:
    """
    Create a secure refresh token.
    
    Returns:
        Tuple of (token_string, expiration_datetime)
    """
    token = secrets.token_urlsafe(64)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return token, expires_at


def create_token_pair(user_id: int, username: str) -> Tuple[str, str, datetime]:
    """
    Create both access and refresh tokens for a user.
    
    Returns:
        Tuple of (access_token, refresh_token, refresh_expires_at)
    """
    access_token = create_access_token(
        data={"sub": str(user_id), "username": username}
    )
    refresh_token, refresh_expires = create_refresh_token()
    return access_token, refresh_token, refresh_expires


def decode_token(token: str, verify_type: Optional[str] = None) -> Optional[TokenData]:
    """
    Decode and validate a JWT token.
    
    Args:
        token: The JWT token to decode
        verify_type: Optional type to verify ("access" or "refresh")
        
    Returns:
        TokenData if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        sub = payload.get("sub")
        username: str = payload.get("username")
        token_type: str = payload.get("type", "access")
        
        if sub is None:
            return None
        
        # Verify token type if specified
        if verify_type and token_type != verify_type:
            return None
            
        # JWT serializes numbers as strings/ints depending on library
        # Handle both cases safely
        user_id = int(sub) if sub is not None else None
        return TokenData(user_id=user_id, username=username, token_type=token_type)
    except (JWTError, ValueError, TypeError):
        return None
