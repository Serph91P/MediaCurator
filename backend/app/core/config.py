"""
Application configuration settings.
All settings can be configured via environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator
from functools import lru_cache
from typing import Optional, List
import secrets
import os


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Application
    app_name: str = "MediaCurator"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    
    # Database - supports SQLite (default) or PostgreSQL
    # SQLite: sqlite+aiosqlite:////data/mediacurator.db
    # PostgreSQL: postgresql+asyncpg://user:password@host:5432/dbname
    database_url: str = "sqlite+aiosqlite:////data/mediacurator.db"
    
    # PostgreSQL specific settings (alternative to database_url)
    postgres_host: Optional[str] = None
    postgres_port: int = 5432
    postgres_user: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_db: Optional[str] = None
    
    @property
    def effective_database_url(self) -> str:
        """Get the effective database URL, preferring PostgreSQL if configured."""
        if self.postgres_host and self.postgres_user and self.postgres_password and self.postgres_db:
            return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        return self.database_url
    
    # Security
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 15  # Short-lived access tokens (15 min)
    refresh_token_expire_days: int = 30  # Long-lived refresh tokens (30 days)
    
    # CORS — comma-separated origins, e.g. "http://localhost:5173,https://app.example.com"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    
    # Trusted proxies — comma-separated IPs that are allowed to set X-Forwarded-For
    trusted_proxies: str = ""
    
    # Audit log retention (days)
    audit_retention_days: int = 90
    
    # Initial admin (for first setup)
    initial_admin_user: Optional[str] = None
    initial_admin_password: Optional[str] = None
    
    # Timezone
    tz: str = "UTC"
    
    # Paths
    data_path: str = "/data"
    media_path: str = "/data"  # Must match your container mount point
    
    # Scheduler
    cleanup_check_interval_minutes: int = 60  # Check every hour
    
    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        if not self.cors_origins or self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_list(self) -> List[str]:
        """Parse comma-separated trusted proxy IPs into a list."""
        if not self.trusted_proxies:
            return []
        return [p.strip() for p in self.trusted_proxies.split(",") if p.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


WEAK_SECRET_KEYS = {
    "please-change-this-secret-key-in-production",
    "changeme",
    "secret",
    "development-secret",
}


def _validate_secret_key(settings: "Settings") -> None:
    """Warn or raise if the secret key is weak."""
    import logging
    log = logging.getLogger(__name__)

    is_weak = (
        settings.secret_key in WEAK_SECRET_KEYS
        or len(settings.secret_key) < 32
    )
    if not is_weak:
        return

    if settings.debug:
        log.warning(
            "⚠️  SECRET_KEY is weak or default. "
            "Set a strong SECRET_KEY before deploying to production."
        )
    else:
        raise ValueError(
            "🚨 SECRET_KEY is weak or a known default. "
            "Set a strong SECRET_KEY (>= 32 chars) via the SECRET_KEY environment variable."
        )


def _validate_cors(settings: "Settings") -> None:
    """Warn if CORS is configured as wildcard, which is insecure with credentials."""
    import logging
    log = logging.getLogger(__name__)

    if settings.cors_origin_list == ["*"]:
        if settings.debug:
            log.warning(
                "⚠️  CORS is set to wildcard '*'. "
                "Set specific CORS_ORIGINS before deploying to production."
            )
        else:
            log.warning(
                "🚨 CORS wildcard '*' used in production mode. "
                "allow_credentials will be disabled. Set specific CORS_ORIGINS."
            )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    s = Settings()
    _validate_secret_key(s)
    _validate_cors(s)
    return s
