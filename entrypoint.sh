#!/bin/sh
set -e

# Run auto-migrations if DATABASE_URL is set (drizzle-kit is installed as a dev dep)
if [ -n "$DATABASE_URL" ]; then
  echo "[NEXUS ENTRYPOINT] Executing database migrations..."
  pnpm exec drizzle-kit migrate || echo "[NEXUS ENTRYPOINT] Migration warning: continuing boot..."
fi

exec "$@"