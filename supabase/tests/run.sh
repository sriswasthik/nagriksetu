#!/usr/bin/env bash
#
# Applies the migrations to a throwaway PostgreSQL cluster and runs the
# row-level security smoke test against them.
#
# Why not `supabase db reset`? Because that needs Docker and a Supabase
# project. This needs only a local PostgreSQL server, so the migrations
# and their policies can be verified anywhere — including CI.
#
#   ./supabase/tests/run.sh
#
# Requires PostgreSQL server binaries (initdb, pg_ctl, psql). On Debian
# and Ubuntu these are in postgresql-16, under
# /usr/lib/postgresql/16/bin.
#
# The cluster is created in a temporary directory and removed on exit,
# so this never touches a real database.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$REPO_ROOT/supabase/migrations"
TESTS="$REPO_ROOT/supabase/tests"

# Debian and Ubuntu keep the server binaries off the default PATH.
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

WORKDIR="$(mktemp -d)"
PGDATA="$WORKDIR/data"
PGSOCK="$WORKDIR/sock"
PGPORT=54329

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

# initdb refuses to run as root, so drop to an unprivileged account when
# necessary and hand it a directory it can actually reach.
RUN_AS=""
if [ "$(id -u)" -eq 0 ]; then
  RUN_AS="${POSTGRES_USER:-postgres}"
  id "$RUN_AS" >/dev/null 2>&1 || {
    echo "error: running as root and no '$RUN_AS' user to drop to." >&2
    exit 1
  }
  chmod 711 "$WORKDIR"
  chown "$RUN_AS" "$WORKDIR"
fi

as_pg() {
  if [ -n "$RUN_AS" ]; then
    su "$RUN_AS" -c "PATH='$PATH' $1"
  else
    eval "$1"
  fi
}

echo "==> Creating a throwaway cluster in $WORKDIR"
mkdir -p "$PGDATA" "$PGSOCK"
[ -n "$RUN_AS" ] && chown "$RUN_AS" "$PGDATA" "$PGSOCK"

as_pg "initdb -D '$PGDATA' -U postgres --auth=trust" >/dev/null

cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = ''
unix_socket_directories = '$PGSOCK'
port = $PGPORT
EOF
[ -n "$RUN_AS" ] && chown "$RUN_AS" "$PGDATA/postgresql.conf"

as_pg "pg_ctl -D '$PGDATA' -l '$PGDATA/server.log' -w start" >/dev/null

PSQL="psql -h '$PGSOCK' -p $PGPORT -U postgres"

run_sql() {
  as_pg "$PSQL -v ON_ERROR_STOP=1 -q -f '$1'"
}

# The test files must be readable by the account psql runs as.
STAGE="$PGDATA/sql"
mkdir -p "$STAGE"
cp "$TESTS"/*.sql "$MIGRATIONS"/*.sql "$STAGE/"
[ -n "$RUN_AS" ] && chown -R "$RUN_AS" "$STAGE"

echo "==> Applying the platform stub"
run_sql "$STAGE/00_platform_stub.sql"

echo "==> Applying migrations"
for file in $(ls "$MIGRATIONS"/*.sql | sort); do
  name="$(basename "$file")"
  printf '    %s ... ' "$name"
  if run_sql "$STAGE/$name" >/dev/null 2>"$WORKDIR/err"; then
    echo "ok"
  else
    echo "FAILED"
    cat "$WORKDIR/err" >&2
    exit 1
  fi
done

# Platform table grants, so a denial in the test is row-level security
# and not a missing GRANT. Applied after the migrations because it has to
# cover the tables they create.
as_pg "$PSQL -v ON_ERROR_STOP=1 -q -c \"
  grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema storage to anon, authenticated, service_role;
\""

# Every suite except the stub, in filename order. 01 seeds the users the
# later suites reuse, so order is load-bearing.
#
# Each suite runs exactly once and its output is kept: they seed their own
# rows, so a second run against the same cluster would collide.
: >"$WORKDIR/out"

for file in $(ls "$TESTS"/[0-9][0-9]_*.sql | sort); do
  name="$(basename "$file")"
  case "$name" in 00_*) continue ;; esac

  echo "==> Running $name"
  echo
  as_pg "$PSQL -f '$STAGE/$name'" 2>&1 | tee -a "$WORKDIR/out"
  echo
done

if grep -q FAIL "$WORKDIR/out"; then
  echo "One or more checks reported FAIL." >&2
  exit 1
fi

printf 'All checks passed (%s ok).\n' "$(grep -cE '\| ok *$' "$WORKDIR/out")"
