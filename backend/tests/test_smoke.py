"""Smoke test to verify the test infrastructure and basic app configuration."""
from app.core.config import get_settings


def test_settings_load():
    """Verify application settings can be loaded without errors."""
    settings = get_settings()
    assert settings is not None
    assert settings.app_name is not None
