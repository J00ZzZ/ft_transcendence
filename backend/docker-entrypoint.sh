#!/bin/sh
set -e

# Config now arrives via compose's env_file (root .env) instead of mounted
# secret files. DATABASE_URL is already the container-correct form
# (host "db") via the environment: override in compose.yaml.
echo "🔍 Validating required env vars..."
for v in DATABASE_URL JWT_SECRET; do
  eval "val=\${$v}"
  if [ -z "$val" ]; then
    echo "FATAL: Missing required env var $v"
    exit 1
  fi
done

# Initialize database schema with Prisma db push
# Note: Not using migrate deploy — this project uses db push (no migration history)
echo "🔧 Pushing Prisma schema to database..."
npx prisma db push --accept-data-loss

exec "$@"
