#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ -z "${BACKUP_DIR:-}" ]]; then
  echo "Set BACKUP_DIR to a restricted directory outside the live database host volume." >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
case "$BACKUP_DIR/" in
  "$ROOT_DIR/"*) echo "BACKUP_DIR must be outside the application project directory." >&2; exit 2 ;;
esac
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_DIR/ksp-gatepass-${STAMP}.dump"
TEMP="${FINAL}.partial"
trap 'rm -f "$TEMP"' EXIT

cd "$ROOT_DIR"
docker compose exec -T db sh -c 'pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' > "$TEMP"
docker compose exec -T db pg_restore --list - < "$TEMP" >/dev/null
mv "$TEMP" "$FINAL"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256")
chmod 600 "$FINAL" "${FINAL}.sha256"
echo "Verified PostgreSQL backup created: $FINAL"
echo "Copy this file and checksum to storage outside the database host."
