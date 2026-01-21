"""
Database models for the application.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey,
    Float, Enum as SQLEnum, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum
from ..core.database import Base


class ServiceType(str, Enum):
    """Service type enumeration."""
    SONARR = "sonarr"
    RADARR = "radarr"
    EMBY = "emby"
    JELLYFIN = "jellyfin"
    JELLYSTAT = "jellystat"


class MediaType(str, Enum):
    """Media type enumeration."""
    MOVIE = "movie"
    SERIES = "series"
    EPISODE = "episode"
    SEASON = "season"


class RuleActionType(str, Enum):
    """Rule action type enumeration."""
    DELETE = "delete"
    NOTIFY_ONLY = "notify_only"
    MOVE_TO_TRASH = "move_to_trash"
    UNMONITOR = "unmonitor"


class NotificationType(str, Enum):
    """Notification type enumeration."""
    WEBHOOK = "webhook"
    DISCORD = "discord"
    SLACK = "slack"
    EMAIL = "email"
    APPRISE = "apprise"


class NotificationEventType(str, Enum):
    """Event types that can trigger notifications."""


class AuditActionType(str, Enum):
    """Types of auditable actions."""
    # Auth actions
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGED = "password_changed"
    
    # User management
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    
    # Service connections
    SERVICE_CREATED = "service_created"
    SERVICE_UPDATED = "service_updated"
    SERVICE_DELETED = "service_deleted"
    SERVICE_TESTED = "service_tested"
    
    # Libraries
    LIBRARY_CREATED = "library_created"
    LIBRARY_UPDATED = "library_updated"
    LIBRARY_DELETED = "library_deleted"
    LIBRARY_SYNCED = "library_synced"
    
    # Rules
    RULE_CREATED = "rule_created"
    RULE_UPDATED = "rule_updated"
    RULE_DELETED = "rule_deleted"
    RULE_ENABLED = "rule_enabled"
    RULE_DISABLED = "rule_disabled"
    RULES_IMPORTED = "rules_imported"
    RULES_EXPORTED = "rules_exported"
    
    # Cleanup
    CLEANUP_STARTED = "cleanup_started"
    CLEANUP_COMPLETED = "cleanup_completed"
    MEDIA_DELETED = "media_deleted"
    MEDIA_STAGED = "media_staged"
    MEDIA_RESTORED = "media_restored"
    
    # Notifications
    NOTIFICATION_CREATED = "notification_created"
    NOTIFICATION_UPDATED = "notification_updated"
    NOTIFICATION_DELETED = "notification_deleted"
    
    # Settings
    SETTINGS_UPDATED = "settings_updated"
    
    # Sessions
    SESSION_REVOKED = "session_revoked"
    ALL_SESSIONS_REVOKED = "all_sessions_revoked"
    MEDIA_FLAGGED = "media_flagged"
    MEDIA_DELETED = "media_deleted"
    MEDIA_STAGED = "media_staged"
    MEDIA_RESTORED = "media_restored"
    CLEANUP_STARTED = "cleanup_started"
    CLEANUP_COMPLETED = "cleanup_completed"
    SYNC_COMPLETED = "sync_completed"
    ERROR = "error"
    TEST = "test"


class SeriesEvaluationMode(str, Enum):
    """How to evaluate series for cleanup rules."""
    WHOLE_SERIES = "whole_series"  # Evaluate the entire series as one unit
    SEASON = "season"  # Evaluate each season independently
    EPISODE = "episode"  # Evaluate each episode independently


class SeriesDeleteTarget(str, Enum):
    """What to delete when a series rule matches."""
    WHOLE_SERIES = "whole_series"  # Delete entire series
    MATCHED_SEASON = "matched_season"  # Delete only the season that matched
    MATCHED_EPISODE = "matched_episode"  # Delete only the episode that matched
    PREVIOUS_SEASONS = "previous_seasons"  # Delete all seasons before the current watched one
    FOLLOWING_SEASONS = "following_seasons"  # Delete all seasons after the current watched one
    PREVIOUS_EPISODES = "previous_episodes"  # Delete all episodes before current in season
    FOLLOWING_EPISODES = "following_episodes"  # Delete all episodes after current in season
    UNWATCHED_EPISODES_IN_SEASON = "unwatched_episodes_in_season"  # Delete unwatched episodes in the matched season
    UNWATCHED_SEASONS = "unwatched_seasons"  # Delete all unwatched seasons


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    """Refresh token for session management."""
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(255), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    device_info = Column(String(255), nullable=True)  # Optional: track device/browser
    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    
    # Relationships
    user = relationship("User", back_populates="refresh_tokens")
    
    @property
    def is_expired(self) -> bool:
        """Check if token is expired."""
        from datetime import datetime, timezone
        return datetime.now(timezone.utc) > self.expires_at
    
    @property
    def is_revoked(self) -> bool:
        """Check if token has been revoked."""
        return self.revoked_at is not None
    
    @property
    def is_valid(self) -> bool:
        """Check if token is valid (not expired and not revoked)."""
        return not self.is_expired and not self.is_revoked


class ServiceConnection(Base):
    """Service connection configuration (Sonarr, Radarr, Emby, etc.)."""
    __tablename__ = "service_connections"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    service_type = Column(SQLEnum(ServiceType), nullable=False)
    url = Column(String(500), nullable=False)
    api_key = Column(String(255), nullable=False)
    is_enabled = Column(Boolean, default=True)
    verify_ssl = Column(Boolean, default=True)
    timeout = Column(Integer, default=30)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_sync = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    libraries = relationship("Library", back_populates="service_connection")


class Library(Base):
    """Library synced from Emby/Jellyfin media server."""
    __tablename__ = "libraries"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    media_type = Column(SQLEnum(MediaType), nullable=False)
    path = Column(String(500), nullable=True)
    
    # Emby/Jellyfin sync fields
    external_id = Column(String(100), nullable=False)  # Library ID from Emby/Jellyfin
    service_connection_id = Column(Integer, ForeignKey("service_connections.id"), nullable=False)
    is_enabled = Column(Boolean, default=True)  # Whether to include in cleanup processing
    
    # Sync tracking
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Unique constraint: one library per service connection and external id
    __table_args__ = (UniqueConstraint('service_connection_id', 'external_id', name='uq_library_service_external'),)
    
    # Relationships
    service_connection = relationship("ServiceConnection", back_populates="libraries")
    cleanup_rules = relationship("CleanupRule", back_populates="library")


class CleanupRule(Base):
    """Cleanup rule configuration."""
    __tablename__ = "cleanup_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True)
    priority = Column(Integer, default=0)  # Higher priority rules are evaluated first
    
    # Rule target
    media_types = Column(JSON, nullable=False, default=list)  # List of media types (can be multiple: movies + series + episodes)
    library_id = Column(Integer, ForeignKey("libraries.id"), nullable=True)
    
    # Conditions (JSON for flexibility)
    conditions = Column(JSON, nullable=False, default=dict)
    """
    Example conditions:
    {
        "disk_space_threshold_percent": 90,
        "not_watched_days": 180,
        "min_age_days": 30,
        "exclude_favorited": true,
        "exclude_currently_watching": true,
        
        # Series-specific settings
        "series_evaluation_mode": "whole_series" | "season" | "episode",  # How to evaluate
        "series_delete_target": "whole_series" | "matched_season" | "matched_episode" | 
                               "previous_seasons" | "following_seasons" | "previous_episodes" | 
                               "following_episodes" | "unwatched_episodes_in_season" | "unwatched_seasons",
        
        "min_episodes_watched_percent": 0,
        "exclude_genres": ["Documentary"],
        "exclude_tags": ["keep"],
        "include_tags": [],
        "rating_below": null,
        "max_items_per_run": null,
        "add_import_exclusion": true,
        "watched_progress_below": 90,
        "exclude_recently_added_days": 7
    }
    """
    
    # Action
    action = Column(SQLEnum(RuleActionType), default=RuleActionType.DELETE)
    grace_period_days = Column(Integer, default=7)  # Days before deletion after flagged
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    library = relationship("Library", back_populates="cleanup_rules")


class MediaItem(Base):
    """Cached media item information."""
    __tablename__ = "media_items"
    
    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String(100), nullable=False)  # ID from source service
    service_connection_id = Column(Integer, ForeignKey("service_connections.id"), nullable=False)
    
    # Media info
    title = Column(String(500), nullable=False)
    media_type = Column(SQLEnum(MediaType), nullable=False)
    year = Column(Integer, nullable=True)
    path = Column(String(1000), nullable=True)
    size_bytes = Column(Float, default=0)
    
    # Series specific
    series_id = Column(String(100), nullable=True)
    season_number = Column(Integer, nullable=True)
    episode_number = Column(Integer, nullable=True)
    
    # Watch status
    is_watched = Column(Boolean, default=False)
    last_watched_at = Column(DateTime(timezone=True), nullable=True)
    watch_count = Column(Integer, default=0)
    progress_percent = Column(Float, default=0)  # 0-100, für "gerade am schauen"
    is_currently_watching = Column(Boolean, default=False)  # Aktive Session
    last_progress_update = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    added_at = Column(DateTime(timezone=True), nullable=True)
    genres = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    is_favorited = Column(Boolean, default=False)
    rating = Column(Float, nullable=True)
    
    # Cleanup status
    flagged_for_cleanup = Column(Boolean, default=False)
    flagged_at = Column(DateTime(timezone=True), nullable=True)
    flagged_by_rule_id = Column(Integer, ForeignKey("cleanup_rules.id"), nullable=True)
    scheduled_cleanup_at = Column(DateTime(timezone=True), nullable=True)
    
    # Staging status (soft-delete before permanent deletion)
    is_staged = Column(Boolean, default=False)
    staged_at = Column(DateTime(timezone=True), nullable=True)
    original_path = Column(String(1000), nullable=True)  # Original path before staging
    staged_path = Column(String(1000), nullable=True)  # Current path in staging
    permanent_delete_at = Column(DateTime(timezone=True), nullable=True)  # When to permanently delete
    staged_library_id = Column(String(100), nullable=True)  # Emby staging library ID
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint('external_id', 'service_connection_id', name='uq_media_external_service'),
    )


class NotificationChannel(Base):
    """Notification channel configuration."""
    __tablename__ = "notification_channels"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    notification_type = Column(SQLEnum(NotificationType), nullable=False)
    is_enabled = Column(Boolean, default=True)
    
    # Configuration (JSON for flexibility)
    config = Column(JSON, nullable=False, default=dict)
    """
    Example configs:
    Webhook: {"url": "...", "method": "POST", "headers": {...}}
    Discord: {"webhook_url": "..."}
    Apprise: {"urls": ["discord://...", "slack://..."]}
    """
    
    # Event triggers (legacy - kept for backwards compatibility)
    notify_on_flagged = Column(Boolean, default=True)
    notify_on_deleted = Column(Boolean, default=True)
    notify_on_error = Column(Boolean, default=True)
    
    # Event types (new - more granular control)
    # JSON list of NotificationEventType values
    event_types = Column(JSON, nullable=True, default=None)
    """
    Example: ["media_flagged", "media_deleted", "cleanup_completed", "error"]
    If None, falls back to legacy notify_on_* fields
    """
    
    # Message templates (Jinja2-style with {{variable}} placeholders)
    title_template = Column(String(500), nullable=True)
    message_template = Column(Text, nullable=True)
    """
    Available variables:
    - {{event_type}}: Type of event (e.g., "media_flagged")
    - {{title}}: Media title or notification title
    - {{message}}: Default message content
    - {{media_title}}: Title of the media item
    - {{media_year}}: Year of the media
    - {{library_name}}: Name of the library
    - {{rule_name}}: Name of the cleanup rule
    - {{size}}: Size of the media
    - {{service}}: Service name (Radarr/Sonarr)
    - {{timestamp}}: Current timestamp
    - {{count}}: Number of items (for batch operations)
    """
    
    # Retry configuration for webhooks
    max_retries = Column(Integer, default=3)
    retry_backoff_base = Column(Integer, default=2)  # Base for exponential backoff in seconds
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CleanupLog(Base):
    """Log of cleanup actions."""
    __tablename__ = "cleanup_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    media_item_id = Column(Integer, ForeignKey("media_items.id"), nullable=True)
    rule_id = Column(Integer, ForeignKey("cleanup_rules.id"), nullable=True)
    
    action = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)  # success, failed, skipped
    details = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)
    
    # Snapshot of media info at time of action
    media_title = Column(String(500), nullable=True)
    media_path = Column(String(1000), nullable=True)
    media_size_bytes = Column(Float, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SystemSettings(Base):
    """System-wide settings storage."""
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(JSON, nullable=True)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class JobExecutionLog(Base):
    """Log of scheduled job executions."""
    __tablename__ = "job_execution_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(100), nullable=False, index=True)  # e.g., "sync_job", "cleanup_job"
    job_name = Column(String(200), nullable=False)
    
    status = Column(String(50), nullable=False)  # running, success, error
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    
    error_message = Column(Text, nullable=True)
    details = Column(JSON, default=dict)  # Job-specific details (items synced, deleted, etc.)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ImportStats(Base):
    """Track import statistics per service."""
    __tablename__ = "import_stats"
    
    id = Column(Integer, primary_key=True, index=True)
    service_connection_id = Column(Integer, ForeignKey("service_connections.id"), nullable=False, index=True)
    
    # Import counts
    items_added = Column(Integer, default=0)
    items_updated = Column(Integer, default=0)
    
    # Breakdown by media type
    movies_added = Column(Integer, default=0)
    series_added = Column(Integer, default=0)
    episodes_added = Column(Integer, default=0)
    
    # Metadata
    sync_duration_seconds = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    service_connection = relationship("ServiceConnection", backref="import_stats")


class AuditLog(Base):
    """Audit log for tracking admin actions."""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Who performed the action
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(100), nullable=True)  # Store username in case user is deleted
    
    # What action was performed
    action = Column(String(50), nullable=False, index=True)
    
    # What resource was affected
    resource_type = Column(String(50), nullable=True)  # e.g., "rule", "service", "user"
    resource_id = Column(Integer, nullable=True)
    resource_name = Column(String(255), nullable=True)  # Human-readable name
    
    # Additional details
    details = Column(JSON, nullable=True)  # Store action-specific details
    
    # Request context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    user = relationship("User", backref="audit_logs")
