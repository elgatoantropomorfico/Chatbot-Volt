#!/bin/sh
set -e

# Apply pending Prisma migrations before booting anything that touches the DB.
# 'migrate deploy' is idempotent: previously applied migrations are no-ops, so
# this is safe to run on every container start.
echo "Applying database migrations..."
npx prisma migrate deploy
echo "Migrations applied."

set +e

# Start worker with auto-restart in background
while true; do
  echo "Starting worker..."
  node dist/worker.js
  EXIT_CODE=$?
  echo "Worker exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
done &

# Start API server (foreground - if this dies, Railway restarts the container)
echo "Starting API server..."
exec node dist/server.js
