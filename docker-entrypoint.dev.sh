#!/bin/bash
set -e

echo "=== Docker Entrypoint Starting ==="
echo "Running as: $(id)"

# Ensure directories exist and fix permissions (we start as root)
mkdir -p /app/data /app/logs
chown -R appuser:appuser /app/data /app/logs /data
echo "Permissions fixed for appuser (1000:1000)"

# Switch to appuser for all processes
echo "Switching to appuser and starting services..."
exec gosu appuser bash -c '
    echo "Now running as: $(id)"
    
    # Start backend with hot reload
    cd /app/backend
    echo "Starting backend on port 8080..."
    uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload &
    BACKEND_PID=$!
    
    # Start frontend dev server
    cd /app/frontend
    echo "Starting frontend on port 5173..."
    npm run dev -- --host 0.0.0.0 --port 5173 &
    FRONTEND_PID=$!
    
    echo "Services started - Backend: $BACKEND_PID, Frontend: $FRONTEND_PID"
    
    # Wait for any process to exit
    wait -n
    EXIT_CODE=$?
    
    echo "Process exited with code $EXIT_CODE, shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit $EXIT_CODE
'
