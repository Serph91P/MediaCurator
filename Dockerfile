# syntax=docker/dockerfile:1

# ================================
# Frontend Builder Stage
# ================================
FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy only dependency files first for better caching
COPY frontend/package*.json ./

# Install dependencies with exact versions locked
RUN npm ci --prefer-offline --no-audit

# Copy source code
COPY frontend/ ./

# Build with production optimizations
ENV NODE_ENV=production
RUN npm run build && \
    # Remove source maps in production for smaller size
    find dist -name '*.map' -delete

# ================================
# Backend Builder Stage
# ================================
FROM python:3.14-slim AS backend-builder

WORKDIR /app

# Install build dependencies in one layer
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy only requirements first for better layer caching
COPY backend/requirements.txt .

# Install Python dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip setuptools wheel && \
    pip install -r requirements.txt

# ================================
# Runtime Stage (Production)
# ================================
FROM python:3.14-slim

# Build arguments for version info
ARG VERSION=dev
ARG COMMIT_SHA=unknown
ARG BRANCH=unknown

# Metadata labels
LABEL org.opencontainers.image.title="MediaCleaner" \
      org.opencontainers.image.description="Automated media library cleanup and management" \
      org.opencontainers.image.source="https://github.com/Serph91P/cleanup-app" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="MediaCleaner" \
      org.opencontainers.image.documentation="https://github.com/Serph91P/cleanup-app#readme" \
      org.opencontainers.image.version="${VERSION}"

# Install only runtime dependencies
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gosu \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user with specific UID/GID for better volume permission handling
RUN groupadd -r -g 1000 appuser && \
    useradd -r -u 1000 -g appuser -m -d /home/appuser -s /sbin/nologin appuser

# Set working directory
WORKDIR /app

# Copy Python virtual environment from builder
COPY --from=backend-builder --chown=appuser:appuser /opt/venv /opt/venv

# Set PATH to use venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Copy application code
COPY --chown=appuser:appuser backend/app ./app

# Copy frontend build from frontend-builder
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/dist ./static

# Copy and prepare entrypoint script
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Create application directories with correct permissions
RUN mkdir -p /app/data /app/logs /data /media && \
    chown -R appuser:appuser /app /data

# Application configuration
ENV APP_ENV=production \
    DATA_PATH=/data \
    MEDIA_PATH=/media \
    DATABASE_URL=sqlite+aiosqlite:///./data/mediacleanup.db \
    TZ=UTC \
    WORKERS=1 \
    VERSION=${VERSION} \
    COMMIT_SHA=${COMMIT_SHA} \
    BRANCH=${BRANCH}

# Security: Run as non-root user by default
# Note: entrypoint will handle permission fixes if needed
USER appuser

# Expose application port
EXPOSE 8080

# Healthcheck for container orchestration
HEALTHCHECK --interval=30s \
    --timeout=10s \
    --start-period=30s \
    --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]

# Default command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
