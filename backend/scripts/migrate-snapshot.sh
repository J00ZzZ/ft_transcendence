#!/usr/bin/env bash
# Regenerates prisma/migrations/ as a single snapshot of the CURRENT schema.
#
# This project develops with `prisma db push` (docker-entrypoint.sh runs it on every
# container start — see prisma.config.ts), not incremental `prisma migrate dev`: schema
# churn (chess -> Ludo rework, field reverts) made a real incremental history noisy and
# not worth maintaining day-to-day.
#
# This script exists only to produce migration history for the ORM module evaluation.
# Every run replaces prisma/migrations/ with ONE folder holding the full DDL for the
# schema as it stands right now, then marks it "applied" against the target database
# instead of running it — the schema is already live there via db push, so re-running
# the DDL would just fail on "relation already exists".
#
# Run again any time schema.prisma changes and you want the snapshot to catch up.
set -euo pipefail
cd "$(dirname "$0")/.."

MIGRATIONS_DIR="prisma/migrations"
NAME="$(date +%Y%m%d%H%M%S)_latest"

echo "-> Clearing previous snapshot(s) in $MIGRATIONS_DIR (keeping migration_lock.toml)"
find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} +

echo "-> Diffing empty schema -> current schema.prisma"
mkdir -p "$MIGRATIONS_DIR/$NAME"
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > "$MIGRATIONS_DIR/$NAME/migration.sql"

echo "-> Marking $NAME as applied (schema is already live via db push, not re-running the DDL)"
npx prisma migrate resolve --applied "$NAME"

echo "✅ prisma/migrations/$NAME now reflects the current schema."
