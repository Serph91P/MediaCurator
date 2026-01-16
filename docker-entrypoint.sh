#!/bin/sh
set -e

echo "=== Docker Entrypoint Starting ==="
echo "Running as user: $(id)"
echo "Working directory: $(pwd)"

# Ensure data and logs directories exist
mkdir -p /app/data /app/logs
echo "Directories created"

# If running as root, fix permissions and switch to appuser
if [ "$(id -u)" = "0" ]; then
    echo "Running as root, fixing permissions..."
    chown -R appuser:appuser /app/data /app/logs
    echo "Switching to appuser..."
    exec gosu appuser "$@"
fi

# If already running as non-root, just execute
echo "Starting application..."
exec "$@"
