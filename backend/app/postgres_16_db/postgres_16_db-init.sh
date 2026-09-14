#!/bin/sh
# =============================================================================
# postgres_16_db init script
# POSTGRES_PASSWORD now arrives directly via compose's env_file (root .env)
# instead of a mounted secret file — the official postgres entrypoint already
# reads it from the environment, so this just validates it's set.
# =============================================================================

echo "🔧 Configuring PostgreSQL..."

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "❌ POSTGRES_PASSWORD is not set!"
  exit 1
fi

exec /usr/local/bin/docker-entrypoint.sh postgres
