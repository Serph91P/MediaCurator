# MediaCleanup

A Docker-optimized media library cleanup application similar to Janitorr/Maintainerr. Automatically clean up your media library based on customizable rules, watch history, and disk space thresholds.

![License](https://img.shields.io/github/license/your-username/media-cleanup)
![Docker Pulls](https://img.shields.io/docker/pulls/your-username/media-cleanup)
![GitHub release](https://img.shields.io/github/v/release/your-username/media-cleanup)

## Features

- 🎬 **Multiple Service Connections**: Connect to multiple Sonarr, Radarr, and Emby instances
- 📊 **Watch History Integration**: Sync watch history from Emby to make informed cleanup decisions
- 🔍 **Dry Run Preview**: Preview what would be cleaned up before running actual cleanup
- 📥 **Import List Exclusions**: Automatically add deleted items to Sonarr/Radarr exclusion lists
- 🧹 **Customizable Cleanup Rules**: Create rules based on:
  - Days since last watched
  - Disk space thresholds
  - Minimum age requirements
  - Favorites exclusion
  - Genre/tag filters
  - Rating thresholds
  - Watch progress
- 🔔 **Notifications**: Get notified via Discord, Slack, or custom webhooks when media is cleaned up
- 📅 **Scheduled Cleanups**: Configure automatic cleanup schedules using cron expressions
- 🔒 **Secure Web Interface**: Modern, responsive UI with JWT authentication
- 🐳 **Docker Optimized**: Built for containerized deployments with minimal resource usage

## Quick Start

### Docker Compose (Recommended)

1. Create a `docker-compose.yml`:

```yaml
services:
  mediacleanup:
    image: ghcr.io/your-username/media-cleanup:latest
    container_name: mediacleanup
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
docker run -d \
  --name mediacleanup \
  -p 8080:8080 \
  -e TZ=Europe/Berlin \
  -e SECRET_KEY=your-secure-secret-key \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v /media:/media:ro \
  ghcr.io/your-username/media-cleanup:latest
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TZ` | Timezone for scheduling | `UTC` |
| `SECRET_KEY` | JWT signing key (change in production!) | - |
| `DATABASE_URL` | Database connection string | `sqlite+aiosqlite:///./data/mediacleanup.db` |
| `FIRST_USER_IS_ADMIN` | First registered user becomes admin | `true` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |

### Volume Mounts

| Path | Description |
|------|-------------|
| `/app/data` | Database and persistent data |
| `/app/logs` | Application logs |
| `/media` | Media files (read-only recommended) |

## Usage

### Initial Setup

1. Open the web interface and create your admin account
2. Add your service connections (Sonarr, Radarr, Emby)
3. Test connections to verify API access
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
