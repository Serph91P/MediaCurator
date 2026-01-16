"""
Security utilities for authentication and password hashing.
"""
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from pydantic import BaseModel
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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_token(token: str) -> Optional[TokenData]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        sub = payload.get("sub")
        username: str = payload.get("username")
        if sub is None:
            return None
        # JWT serializes numbers as strings/ints depending on library
        # Handle both cases safely
        user_id = int(sub) if sub is not None else None
        return TokenData(user_id=user_id, username=username)
    except (JWTError, ValueError, TypeError):
        return None
