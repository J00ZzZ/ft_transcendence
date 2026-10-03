#!/bin/sh
set -e

# Config now arrives via compose's env_file (root .env) instead of mounted
# secret files. DATABASE_URL is already the container-correct form
# (host "db") via the environment: override in compose.yaml.
echo "🔍 Validating required env vars..."
for v in DATABASE_URL JWT_SECRET ENGINE_JWT_SECRET OAUTH_STATE_SECRET ENGINE_API_KEY; do
  eval "val=\${$v}"
  if [ -z "$val" ]; then
    echo "FATAL: Missing required env var $v"
    exit 1
  fi
done

# Initialize database schema with Prisma db push (no migration history: see
# docs/architecture.md). No --accept-data-loss: a change that would drop or
# narrow a column fails here instead of destroying data unattended.
echo "🔧 Pushing Prisma schema to database..."
npx prisma db push

exec "$@"
