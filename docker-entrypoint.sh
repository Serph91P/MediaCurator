#!/bin/sh
set -e

echo "=== Docker Entrypoint Starting ==="
echo "Running as user: $(id)"
echo "Working directory: $(pwd)"

# Ensure data and logs directories exist
mkdir -p /app/data /app/logs /app/config
echo "Directories created"

# Pre-flight: verify /app/config is writable. The application's secret key
# (used to sign JWT cookies) and the SQLite database both live there. If the
# directory is not writable, sessions and user accounts would silently be
# lost on every restart, making the setup wizard reappear unexpectedly.
if [ ! -w /app/config ]; then
    echo "ERROR: /app/config is not writable by the current user ($(id))." >&2
    echo "       Mount a writable volume at /app/config (named volume recommended)." >&2
    exit 1
fi

# Warn loudly if SECRET_KEY is not set. The app will persist a generated key
# to /app/config/.secret_key as a fallback, but operators should set it
# explicitly in production.
if [ -z "${SECRET_KEY}" ]; then
    echo "WARNING: SECRET_KEY env var is not set. A persistent key file will" >&2
    echo "         be auto-generated under /app/config/.secret_key. For" >&2
    echo "         production deployments, set SECRET_KEY explicitly." >&2
fi

# If running as root, fix permissions and switch to appuser
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing permissions..."
    chown -R appuser:appuser /app/data /app/logs /app/config
    echo "Switching to appuser..."
    exec gosu appuser "$@"
fi

# If already running as non-root, just execute
echo "Starting application..."
exec "$@"
