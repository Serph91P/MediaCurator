#!/bin/bash
set -e

# Start backend with hot reload
cd /app/backend
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload &

# Start frontend dev server
cd /app/frontend
npm run dev -- --host 0.0.0.0 &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
