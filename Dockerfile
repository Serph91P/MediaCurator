# Build stage for frontend
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM python:3.14-slim AS backend-builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.14-slim

LABEL org.opencontainers.image.title="MediaCleanup"
LABEL org.opencontainers.image.description="Docker-optimized media library cleanup application"
LABEL org.opencontainers.image.source="https://github.com/your-username/media-cleanup"
LABEL org.opencontainers.image.licenses="MIT"

# Install runtime dependencies + su-exec for entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash --uid 1000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=backend-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy backend code
COPY backend/app ./app

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./static

# Copy entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories (will be re-created by entrypoint if volume-mounted)
RUN mkdir -p /app/data /app/logs && \
    chown -R appuser:appuser /app

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production \
    DATABASE_URL=sqlite+aiosqlite:///./data/mediacleanup.db \
    TZ=UTC

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
