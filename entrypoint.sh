#!/bin/sh
set -e

# Run auto-migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "[NEXUS ENTRYPOINT] Executing database migrations..."
  npx drizzle-kit migrate || echo "[NEXUS ENTRYPOINT] Migration warning: continuous boot..."
fi

exec "$@"
