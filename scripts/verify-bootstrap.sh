#!/usr/bin/env bash
#
# Proves supabase/bootstrap.sql does what it claims.
#
#   ./scripts/verify-bootstrap.sh
#
# Builds a throwaway database holding ONLY the original 20260813 schema —
# the exact state the reported deployment was in — then:
#
#   1. runs bootstrap.sql three times, because a file people paste by hand
#      will be pasted twice
#   2. runs diagnose.sql and requires every row to read `ok`
#   3. checks the reference data did not multiply
#   4. checks the guard fires on a database with no schema at all
#
# Needs PostgreSQL server binaries. No Docker, no Supabase project.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

for candidate in /usr/lib/postgresql/*/bin; do
  [ -d "$candidate" ] && PATH="$candidate:$PATH"
done
export PATH

for tool in initdb pg_ctl psql; do
  command -v "$tool" >/dev/null || {
    echo "error: $tool not found. Install the PostgreSQL server package." >&2
    exit 1
  }
done

WORK="$(mktemp -d)"
PGDATA="$WORK/data"
PGSOCK="$WORK/sock"
PGPORT=54332

cleanup() {
  run_pg "pg_ctl -D '$PGDATA' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

RUN_AS=""
if [ "$(id -u)" -eq 0 ]; then
  RUN_AS="${POSTGRES_USER:-postgres}"
  id "$RUN_AS" >/dev/null 2>&1 || {
    echo "error: running as root and no '$RUN_AS' user to drop to." >&2
    exit 1
  }
fi

run_pg() {
  if [ -n "$RUN_AS" ]; then
    su "$RUN_AS" -c "PATH='$PATH' $1"
  else
    eval "$1"
  fi
}

mkdir -p "$PGDATA" "$PGSOCK"
if [ -n "$RUN_AS" ]; then
  chmod 711 "$WORK"
  chown -R "$RUN_AS" "$WORK"
fi

echo "==> Throwaway cluster in $WORK"
run_pg "initdb -D '$PGDATA' -U postgres --auth=trust" >/dev/null

cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$PGSOCK'
port = $PGPORT
EOF
[ -n "$RUN_AS" ] && chown "$RUN_AS" "$PGDATA/postgresql.conf"

run_pg "pg_ctl -D '$PGDATA' -l '$PGDATA/server.log' -w start" >/dev/null

PSQL="psql -h '$PGSOCK' -p $PGPORT -U postgres"
STAGE="$PGDATA/sql"
mkdir -p "$STAGE"
cp supabase/tests/*.sql supabase/migrations/*.sql \
   supabase/bootstrap.sql supabase/diagnose.sql "$STAGE/"
[ -n "$RUN_AS" ] && chown -R "$RUN_AS" "$STAGE"

failures=0

# ------------------------------------------------------------
echo "==> The guard fires when the original schema is absent"
if run_pg "$PSQL -v ON_ERROR_STOP=1 -q -f '$STAGE/bootstrap.sql'" >/dev/null 2>"$WORK/err"; then
  echo "FAIL: bootstrap.sql ran against an empty database instead of refusing"
  failures=$((failures + 1))
elif grep -q "original CityTrace schema is not present" "$WORK/err"; then
  echo "ok   refused with the expected message"
else
  echo "FAIL: refused, but not with the guard's message:"
  head -3 "$WORK/err"
  failures=$((failures + 1))
fi

# ------------------------------------------------------------
echo "==> Installing the platform stub and the ORIGINAL schema only"
run_pg "$PSQL -v ON_ERROR_STOP=1 -q -f '$STAGE/00_platform_stub.sql'"

for path in $(ls supabase/migrations/2026081[0-3]*.sql | sort); do
  run_pg "$PSQL -v ON_ERROR_STOP=1 -q -f '$STAGE/$(basename "$path")'" >/dev/null 2>&1
done
echo "    ok — this is the state the reported deployment was in"

# The failure that was reported, reproduced.
echo "==> Confirming submissions are broken before bootstrap"
if run_pg "$PSQL -tAc \"select public.submit_complaint('00000000-0000-0000-0000-000000000001','A title','A description long enough.','other',12.9,77.5,'Somewhere')\"" >/dev/null 2>&1; then
  echo "FAIL: submit_complaint already worked; the premise of this test is wrong"
  failures=$((failures + 1))
else
  echo "ok   submit_complaint does not exist yet, as reported"
fi

# ------------------------------------------------------------
# createComplaint() falls back to a direct insert when the function is
# absent. That path assumes specific things about an old schema; if any of
# them are wrong the fallback is worse than useless, so they are checked
# against a genuinely old schema rather than reasoned about.
echo "==> The degraded insert path's assumptions hold on the old schema"

run_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"
  insert into auth.users (id, email, raw_user_meta_data)
  values ('99999999-9999-9999-9999-999999999999','fallback@test','{\\\"full_name\\\":\\\"Fallback Check\\\"}');\"" >/dev/null

run_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;\"" >/dev/null

# 1. submission_key does not exist yet, so the first attempt must fail 42703.
code="$(run_pg "$PSQL -tAc \"
  set role authenticated;
  select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
  do \\\$\\\$ begin
    insert into public.complaints
      (submission_key, citizen_id, title, description, category, status, latitude, longitude, address)
    values (gen_random_uuid(), '99999999-9999-9999-9999-999999999999', 'Fallback probe',
            'Checking the degraded path.', 'other', 'submitted', 12.9, 77.5, 'Mill Road');
  exception when others then raise notice 'SQLSTATE=%', sqlstate; end \\\$\\\$;\"" 2>&1 | grep -o 'SQLSTATE=[0-9A-Z]*' | head -1)"

if [ "$code" = "SQLSTATE=42703" ]; then
  echo "ok   submission_key absent -> 42703, which is what triggers retry 1"
else
  echo "FAIL: expected SQLSTATE=42703 for a missing submission_key, got '$code'"
  failures=$((failures + 1))
fi

# 2. Without submission_key, the number is missing -> 23502 naming the column.
msg="$(run_pg "$PSQL -tAc \"
  set role authenticated;
  select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
  do \\\$\\\$ begin
    insert into public.complaints
      (citizen_id, title, description, category, status, latitude, longitude, address)
    values ('99999999-9999-9999-9999-999999999999', 'Fallback probe',
            'Checking the degraded path.', 'other', 'submitted', 12.9, 77.5, 'Mill Road');
  exception when others then raise notice 'SQLSTATE=% COL=%', sqlstate, sqlerrm; end \\\$\\\$;\"" 2>&1)"

if printf '%s' "$msg" | grep -q "SQLSTATE=23502" && printf '%s' "$msg" | grep -q "complaint_number"; then
  echo "ok   no number assigned -> 23502 naming complaint_number, which triggers retry 2"
else
  echo "FAIL: expected 23502 mentioning complaint_number, got: $(printf '%s' "$msg" | head -2)"
  failures=$((failures + 1))
fi

# 3. With a client-supplied number the insert succeeds — the citizen can file.
filed="$(run_pg "$PSQL -tAc \"
  set role authenticated;
  select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false);
  insert into public.complaints
    (complaint_number, citizen_id, title, description, category, status, latitude, longitude, address)
  values ('NS-2026-123456789012', '99999999-9999-9999-9999-999999999999', 'Fallback probe',
          'Checking the degraded path.', 'other', 'submitted', 12.9, 77.5, 'Mill Road')
  returning complaint_number;\"" 2>&1 | grep -Eo 'NS-[0-9]{4}-[0-9]+' | head -1)"

if [ "$filed" = "NS-2026-123456789012" ]; then
  echo "ok   client-supplied number accepted -> the citizen can still file"
else
  echo "FAIL: the degraded insert did not succeed, got '$filed'"
  failures=$((failures + 1))
fi

run_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"delete from public.complaints where title = 'Fallback probe';\"" >/dev/null

# ------------------------------------------------------------
echo "==> Running bootstrap.sql three times"
for pass in 1 2 3; do
  printf '    pass %s ... ' "$pass"
  if run_pg "$PSQL -v ON_ERROR_STOP=1 -q -f '$STAGE/bootstrap.sql'" >/dev/null 2>"$WORK/err"; then
    echo "ok"
  else
    echo "FAILED"
    #
    # ERROR lines first, then the head of the log.
    #
    # This printed `head -5` alone, and a re-run of bootstrap.sql opens
    # with several NOTICEs about objects that already exist — which is
    # exactly what a second pass is supposed to produce. So the five lines
    # shown were all benign and the actual ERROR was never displayed. A
    # real idempotency bug (a policy created without a matching
    # `drop policy if exists`) surfaced as "FAILED" with no reason given.
    grep -E '\bERROR\b' "$WORK/err" >&2 || head -10 "$WORK/err" >&2
    failures=$((failures + 1))
    break
  fi
done

# Platform grants, so the smoke checks below exercise RLS and not GRANT.
run_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema storage to anon, authenticated, service_role;
\"" >/dev/null

# ------------------------------------------------------------
echo "==> diagnose.sql reports everything present"
run_pg "$PSQL -f '$STAGE/diagnose.sql'" >"$WORK/diag" 2>&1 || true

if grep -q "MISSING" "$WORK/diag"; then
  echo "FAIL: still MISSING after bootstrap:"
  grep "MISSING" "$WORK/diag" >&2
  failures=$((failures + 1))
else
  printf 'ok   %s objects present, none missing\n' "$(grep -c '| ok' "$WORK/diag" || echo 0)"
fi

# ------------------------------------------------------------
echo "==> Reference data did not multiply"
counts="$(run_pg "$PSQL -tAc \"
  select count(*) from public.departments
  union all select count(*) from public.wards
  union all select count(*) from storage.buckets;\"" | tr -d ' ' | paste -sd/ -)"

if [ "$counts" = "8/6/2" ]; then
  echo "ok   departments/wards/buckets = $counts"
else
  echo "FAIL: expected 8/6/2 after three runs, got $counts"
  failures=$((failures + 1))
fi

# ------------------------------------------------------------
echo "==> A submission now succeeds"
run_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"
  insert into auth.users (id, email, raw_user_meta_data)
  values ('88888888-8888-8888-8888-888888888888','bootstrap@test','{\\\"full_name\\\":\\\"Bootstrap Check\\\"}');\"" >/dev/null

number="$(run_pg "$PSQL -tAc \"
  set role authenticated;
  select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888',false);
  select (public.submit_complaint(
    '00000000-0000-0000-0000-000000000002',
    'Bootstrap verification report',
    'Filed by verify-bootstrap.sh to prove the schema works end to end.',
    'other', 12.9716, 77.5946, 'Somewhere on Mill Road'
  )).complaint_number;\"" | grep -Eo 'NS-[0-9]{4}-[0-9]+' | head -1)"

if printf '%s' "$number" | grep -Eq '^NS-[0-9]{4}-[0-9]{6}$'; then
  echo "ok   filed as $number"
else
  echo "FAIL: expected an NS-YYYY-NNNNNN number, got '$number'"
  failures=$((failures + 1))
fi

echo
if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed." >&2
  exit 1
fi

echo "bootstrap.sql verified: refuses an empty database, idempotent over three runs, leaves a working schema."
