# MediaCurator

Intelligently curate and manage your media library with automated cleanup rules. A Docker-optimized application for Sonarr, Radarr, Emby, and Jellyfin that helps you maintain a clean, organized media collection.

![License](https://img.shields.io/github/license/Serph91P/mediacurator)
![Docker Pulls](https://img.shields.io/docker/pulls/ghcr.io/serph91p/mediacurator)
![GitHub release](https://img.shields.io/github/v/release/Serph91P/mediacurator)

## Features

- **Multiple Service Connections**: Connect to multiple Sonarr, Radarr, and Emby instances
- **Watch History Integration**: Sync watch history from Emby to make informed cleanup decisions
- **Dry Run Preview**: Preview what would be cleaned up before running actual cleanup
- **Import List Exclusions**: Automatically add deleted items to Sonarr/Radarr exclusion lists
- **Customizable Cleanup Rules**: Create rules based on:
  - Days since last watched
  - Disk space thresholds
  - Minimum age requirements
  - Favorites exclusion
  - Genre/tag filters
  - Rating thresholds
  - Watch progress
- **Notifications**: Get notified via Discord, Slack, or custom webhooks when media is cleaned up
- **Scheduled Cleanups**: Configure automatic cleanup schedules using cron expressions
- **Secure Web Interface**: Modern, responsive UI with JWT authentication
- **Docker Optimized**: Built for containerized deployments with minimal resource usage

## Quick Start

### Docker Compose (Recommended)

1. Create a `docker-compose.yml`:

```yaml
services:
  mediacurator:
    image: ghcr.io/serph91p/mediacurator:latest
    container_name: mediacurator
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - TZ=Europe/Berlin
      - SECRET_KEY=your-secure-secret-key
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - /media:/media:ro  # Same path as your media server
```

2. Start the container:

```bash
docker compose up -d
```

3. Access the web interface at `http://localhost:8080`

### Docker CLI

```bash
# Pull specific version
docker pull ghcr.io/serph91p/mediacurator:1.0.0

# Or pull latest stable
docker pull ghcr.io/serph91p/mediacurator:latest

# Or pull development version
docker pull ghcr.io/serph91p/mediacurator:dev

# Run container
docker run -d \
  --name mediacurator \
  -p 8080:8080 \
  -e TZ=Europe/Berlin \
  -e SECRET_KEY=your-secure-secret-key \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v /media:/media:ro \
  ghcr.io/serph91p/mediacurator:latest
```

### Available Docker Tags

- `latest` - Latest stable release from main branch
- `stable` - Alias for latest
- `dev` - Latest development build from develop branch
- `1.2.3` - Specific version (semantic versioning)
- `1.2` - Latest patch version of 1.2.x
- `1` - Latest minor version of 1.x.x
- `dev.123.abc123` - Development build with commit count and SHA
- `sha-abc123` - Build from specific commit

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TZ` | Timezone for scheduling | `UTC` |
| `SECRET_KEY` | JWT signing key (change in production!) | - |
| `DATABASE_URL` | Database connection string | `sqlite+aiosqlite:////data/mediacurator.db` |
| `INITIAL_ADMIN_USER` | Pre-create admin user (optional) | - |
| `INITIAL_ADMIN_PASSWORD` | Password for pre-created admin (optional) | - |
| `DEBUG` | Enable debug logging | `false` |

### Volume Mounts

| Path | Description | Type |
|------|-------------|------|
| `mediacurator_data` → `/data` | Database and persistent data | Named volume |
| `mediacurator_logs` → `/app/logs` | Application logs | Named volume |
| `/media` | Media files (read-only recommended) | Bind mount |

Note: Named volumes are used for application data and logs, managed automatically by Docker. For development, use bind mounts via `docker-compose.dev.yml`.

## Usage

### Initial Setup

1. Start the application with `docker compose up -d`
2. Open http://localhost:8080 in your browser
3. You'll be redirected to create your admin account (first user is automatically admin)
4. Add your service connections (Sonarr, Radarr, Emby)
5. Test connections to verify API access
4. Configure libraries from your Emby server
5. Create cleanup rules or use templates
6. Set up notification channels (optional)
7. Configure system settings (schedules, dry-run mode)

### Cleanup Rules

Rules define when and how media should be cleaned up. Each rule can have multiple conditions:

- **Not Watched Days**: Delete media not watched for X days
- **Disk Space Threshold**: Only clean up when disk usage exceeds X%
- **Minimum Age**: Don't delete media added less than X days ago
- **Exclude Favorites**: Never delete favorited items
- **Exclude Currently Watching**: Never delete items someone is actively watching
- **Exclude In Progress**: Never delete items that are partially watched
- **Exclude Recently Added**: Don't delete items added within X days
- **Genre/Tag Filters**: Include or exclude by genre/tag
- **Rating Threshold**: Only delete items rated below X
- **Watch Progress Threshold**: Only delete if watch progress is below X%
- **Max Items Per Run**: Limit how many items are deleted per cleanup run

### Actions

- **Delete**: Remove from Sonarr/Radarr and delete files
- **Unmonitor**: Stop monitoring in Sonarr/Radarr but keep files
- **Notify Only**: Send notification without taking action

### Import Exclusion Integration

When "Add to Import Exclusion" is enabled on a rule, deleted items will be automatically added to:
- **Sonarr**: Import List Exclusions (prevents re-downloading via import lists)
- **Radarr**: Movie Exclusions (prevents re-downloading via import lists)

### Dry Run Preview

The **Preview** page lets you see exactly what would be cleaned up without actually deleting anything:
- View all items that match your rules
- See detailed reasoning for why each item would/wouldn't be deleted
- View item details (watch progress, ratings, genres, etc.)
- Filter by rules or see all at once

Enable **Dry Run Mode** in Settings to have scheduled cleanups also run in preview mode.

## Configuration

### What's Configured Where?

| Configuration | Where | Description |
|---------------|-------|-------------|
| Service URLs & API Keys | Web UI (Services) | Stored in database |
| Cleanup Rules | Web UI (Rules) | Stored in database |
| Schedules | Web UI (Settings) | Stored in database |
| System Settings | Web UI (Settings) | Stored in database |
| Timezone (`TZ`) | Environment Variable | Container-level setting |
| `SECRET_KEY` | Environment Variable | Should not change after setup |
| Volume Mounts | Docker Compose | File system paths |

## API Documentation

The API documentation is available at `/api/docs` when running the application.

## Development

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker (optional)

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Docker Development

```bash
docker compose -f docker-compose.dev.yml up
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by [Janitorr](https://github.com/Schaka/janitorr) and [Maintainerr](https://github.com/jorenn92/Maintainerr)
- Built with [FastAPI](https://fastapi.tiangolo.com/), [React](https://react.dev/), and [TailwindCSS](https://tailwindcss.com/)
