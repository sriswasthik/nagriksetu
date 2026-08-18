#!/usr/bin/env bash
#
# Regenerates supabase/bootstrap.sql from every migration after the
# original schema.
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
#
# EVERYTHING ELSE IS INCLUDED BY EXCLUSION, NOT BY DATE
#
# This used to glob `20260814*`, which was every migration that existed
# when it was written. Adding `20260816120000_work_order_lifecycle.sql`
# silently produced an unchanged bootstrap.sql — the file kept verifying,
# because what it contained still worked; it just no longer contained the
# newest work. A date prefix is not a category, so the rule is now "all
# of them except the original schema", which cannot go stale the same
# way.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT="supabase/bootstrap.sql"
# Sorted by filename, which is the order the migrations must run in.
mapfile -t SOURCES < <(
  find supabase/migrations -maxdepth 1 -name '*.sql' \
    -not -name '20260813*' | sort
)

[ "${#SOURCES[@]}" -gt 0 ] || {
  echo "error: no migrations found to bootstrap from." >&2
  exit 1
}

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
