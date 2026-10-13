#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"

psql_base=(psql -X --no-psqlrc --set=ON_ERROR_STOP=1)

mapfile -d '' migration_files < <(find /migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' -print0 | sort -z)
if ((${#migration_files[@]} == 0)); then
  echo "No migration files found."
  exit 0
fi

ledger_exists="$("${psql_base[@]}" -Atqc "SELECT to_regclass('public.schema_migrations') IS NOT NULL")"
pending=()

for migration_file in "${migration_files[@]}"; do
  migration_name="$(basename "$migration_file")"
  checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
  applied_checksum=""
  if [[ "$ledger_exists" == "t" ]]; then
    applied_checksum="$("${psql_base[@]}" -Atqc "SELECT checksum FROM schema_migrations WHERE name = '$migration_name'")"
  fi
  if [[ -n "$applied_checksum" && "$applied_checksum" != "$checksum" ]]; then
    echo "ERROR: applied migration $migration_name has a different checksum." >&2
    echo "Create a new migration instead of editing an applied migration." >&2
    exit 1
  fi
  if [[ -z "$applied_checksum" ]]; then
    pending+=("$migration_file")
  fi
done

echo "Applied migrations: $((${#migration_files[@]} - ${#pending[@]}))"
echo "Pending migrations: ${#pending[@]}"
for migration_file in "${pending[@]}"; do
  echo "  - $(basename "$migration_file")"
done

if [[ "${MIGRATION_DRY_RUN:-0}" == "1" || ${#pending[@]} -eq 0 ]]; then
  exit 0
fi

mkdir -p /backups
backup_file="/backups/${PGDATABASE}_before_migrate_$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "Creating restorable backup: $backup_file"
pg_dump --no-owner --no-acl --format=custom --file="$backup_file"
test -s "$backup_file"

for migration_file in "${pending[@]}"; do
  migration_name="$(basename "$migration_file")"
  checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
  echo "Applying $migration_name"
  "${psql_base[@]}" --single-transaction --quiet \
    -c "SELECT pg_advisory_xact_lock(hashtextextended('qlpk_schema_migrations', 0)); SET LOCAL lock_timeout = '15s'; CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);" \
    -f "$migration_file" \
    -c "INSERT INTO schema_migrations(name, checksum) VALUES ('$migration_name', '$checksum');"
done

echo "Migrations completed. Backup retained at $backup_file"
