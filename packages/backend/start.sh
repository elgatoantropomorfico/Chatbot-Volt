#!/bin/sh

# Start worker with auto-restart in background
while true; do
  echo "🤖 Starting worker..."
  npx tsx src/worker.ts
  EXIT_CODE=$?
  echo "⚠️ Worker exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done &

# Start API server (foreground - if this dies, Railway restarts the container)
echo "🚀 Starting API server..."
exec npx tsx src/server.ts
