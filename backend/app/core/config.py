"""
Application configuration settings.
All settings can be configured via environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
from typing import Optional
import secrets


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Application
    app_name: str = "MediaCurator"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    
    # Database
    database_url: str = "sqlite+aiosqlite:////data/mediacurator.db"
    
    # Security
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15  # Short-lived access tokens (15 min)
    refresh_token_expire_days: int = 30  # Long-lived refresh tokens (30 days)
    
    # Initial admin (for first setup)
    initial_admin_user: Optional[str] = None
    initial_admin_password: Optional[str] = None
    
    # Timezone
    tz: str = "UTC"
    
    # Paths
    data_path: str = "/data"
    media_path: str = "/media"
    
    # Scheduler
    cleanup_check_interval_minutes: int = 60  # Check every hour
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
