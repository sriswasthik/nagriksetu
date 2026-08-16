#!/usr/bin/env bash
#
# Regenerates supabase/bootstrap.sql from the 20260814* migrations.
#
#   ./scripts/generate-bootstrap.sh
#
# bootstrap.sql is a paste-into-the-SQL-editor version of everything the
# application needs on top of the original 20260813 schema. Run this after
# adding a migration, or the file goes stale and someone bootstraps a
# database that is missing the newest work.
#
# The 20260813 files are deliberately excluded: the original schema is not
# idempotent (`create type ... as enum` has no IF NOT EXISTS), and any
# database being bootstrapped already has it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT="supabase/bootstrap.sql"
SOURCES=(supabase/migrations/20260814*.sql)

{
  cat supabase/bootstrap.header.sql

  for path in "${SOURCES[@]}"; do
    printf '\n-- ============================================================\n'
    printf -- '-- FROM %s\n' "$(basename "$path")"
    printf -- '-- ============================================================\n\n'
    cat "$path"
    printf '\n'
  done

  cat supabase/bootstrap.footer.sql
} > "$OUT"

printf 'Wrote %s (%s lines from %s migrations)\n' \
  "$OUT" "$(wc -l < "$OUT")" "${#SOURCES[@]}"

cat <<'NOTE'

Verify it is still safe to run repeatedly:
  ./scripts/verify-bootstrap.sh
NOTE
