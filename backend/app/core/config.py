"""
Application configuration settings.
All settings can be configured via environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator
from functools import lru_cache
from pathlib import Path
from typing import Optional, List
import logging
import secrets
import os
import stat

_log = logging.getLogger(__name__)

# Path to the persisted secret key file. Used as a fallback when SECRET_KEY env
# is not set, so that container restarts do not invalidate all sessions.
# Configurable via SECRET_KEY_FILE env var (read at module import time).
_SECRET_KEY_FILE = os.environ.get(
    "SECRET_KEY_FILE",
    "/app/config/.secret_key",
)


def _load_or_create_secret_key() -> str:
    """Resolve the application secret key with the following precedence:

    1. ``SECRET_KEY`` environment variable (highest, never written to disk).
    2. Existing key file at ``SECRET_KEY_FILE``.
    3. Newly generated key, persisted to ``SECRET_KEY_FILE`` (chmod 600).

    The persisted key prevents the historical bug where every container
    restart silently regenerated the key and invalidated all JWT sessions,
    which made the UI fall back to the registration / setup wizard.
    """
    env_key = os.environ.get("SECRET_KEY")
    if env_key and env_key.strip():
        return env_key.strip()

    key_path = Path(_SECRET_KEY_FILE)
    try:
        if key_path.is_file():
            existing = key_path.read_text(encoding="utf-8").strip()
            if existing:
                return existing
            _log.warning("Secret key file %s is empty; regenerating.", key_path)

        key_path.parent.mkdir(parents=True, exist_ok=True)
        new_key = secrets.token_urlsafe(48)
        # Write atomically and restrict permissions.
        tmp_path = key_path.with_suffix(key_path.suffix + ".tmp")
        tmp_path.write_text(new_key, encoding="utf-8")
        try:
            os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            # chmod may fail on some filesystems (e.g. Windows mounts) — non-fatal.
            pass
        os.replace(tmp_path, key_path)
        _log.warning(
            "SECRET_KEY env var not set; generated and persisted a new key at %s. "
            "For production, set SECRET_KEY explicitly.",
            key_path,
        )
        return new_key
    except OSError as exc:
        # Last-resort fallback: in-memory key. Logged loudly because this means
        # sessions will not survive a process restart.
        _log.error(
            "Cannot read or write secret key file %s (%s). "
            "Falling back to an in-memory key — sessions will be lost on restart.",
            key_path,
            exc,
        )
        return secrets.token_urlsafe(48)


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
    # SQLite default lives in /app/config which matches the persistent named
    # volume used by the production docker-compose setup. /data is reserved
    # for media (read-only mount) and must not contain the application DB.
    # PostgreSQL: postgresql+asyncpg://user:password@host:5432/dbname
    database_url: str = "sqlite+aiosqlite:////app/config/mediacurator.db"
    
    # PostgreSQL specific settings (alternative to database_url)
    postgres_host: Optional[str] = None
    postgres_port: int = 5432
    postgres_user: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_db: Optional[str] = None
    
    @property
    def effective_database_url(self) -> str:
        """Get the effective database URL, preferring PostgreSQL if configured.

        Raises ValueError when PostgreSQL is partially configured (e.g. host
        set but password missing). This prevents silently falling back to
        SQLite, which would create a fresh empty database and make existing
        users "disappear" after a restart.
        """
        pg_fields = {
            "POSTGRES_HOST": self.postgres_host,
            "POSTGRES_USER": self.postgres_user,
            "POSTGRES_PASSWORD": self.postgres_password,
            "POSTGRES_DB": self.postgres_db,
        }
        set_fields = {k: v for k, v in pg_fields.items() if v}
        if set_fields and len(set_fields) < len(pg_fields):
            missing = sorted(k for k, v in pg_fields.items() if not v)
            raise ValueError(
                "PostgreSQL is partially configured. Missing: "
                f"{', '.join(missing)}. Set all POSTGRES_* env vars or none."
            )
        if len(set_fields) == len(pg_fields):
            return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        return self.database_url

    # Security
    # Secret key is resolved via env var, persisted file, or generated once and
    # written to disk — see ``_load_or_create_secret_key``. The previous
    # ``secrets.token_urlsafe`` default_factory caused a new key on every
    # container restart, invalidating all sessions.
    secret_key: str = Field(default_factory=_load_or_create_secret_key)
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
