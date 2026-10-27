#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE="${1:-}"
RESTORE_DATABASE="${2:-}"
if [[ -z "$ARCHIVE" || -z "$RESTORE_DATABASE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <backup.dump> <new_scratch_database_name>" >&2
  exit 2
fi
if [[ ! "$RESTORE_DATABASE" =~ ^ksp_restore_[a-z0-9_]+$ ]]; then
  echo "Scratch database name must start with ksp_restore_ and use lowercase letters, numbers or underscores." >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
docker compose exec -T db pg_restore --list - < "$ARCHIVE" >/dev/null
docker compose exec -T db createdb --username=postgres "$RESTORE_DATABASE"
docker compose exec -T db pg_restore --exit-on-error --no-owner --no-acl --username=postgres --dbname="$RESTORE_DATABASE" - < "$ARCHIVE"
EVENT_COUNT="$(docker compose exec -T db psql --no-psqlrc --tuples-only --no-align --username=postgres --dbname="$RESTORE_DATABASE" --command='SELECT count(*) FROM "Event"')"
echo "Restore completed into $RESTORE_DATABASE; restored event rows: $EVENT_COUNT"
echo "This script leaves both the live database and scratch database intact. Verify the scratch database, then remove it only through an explicit operator action."
