#!/usr/bin/env bash
#
# Asserts that an unauthenticated request cannot reach a protected route.
#
#   ./scripts/verify-route-protection.sh
#
# Builds the app, serves it, and checks the redirect for every workspace
# route. Deliberately uses throwaway Supabase credentials: with no session
# cookie there is no token to verify, so the proxy decides without making
# a network call, and the result does not depend on a live project.
#
# WHY THIS EXISTS
#
# The proxy was previously at the repository root while the app lives in
# src/app. Next.js only picks up proxy.ts beside `app` — so the file never
# ran, and nothing failed loudly to say so: sessions were simply never
# refreshed and every protected route was reachable. A build-output line
# is easy to miss; a failing assertion is not.
#
# This complements supabase/tests/run.sh, which checks the boundary that
# actually protects the data. This one checks that the wrong person never
# gets as far as the shell.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-3199}"
BASE="http://localhost:$PORT"

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_verification_only}"

SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

BUILD_LOG="$(mktemp)"
trap 'cleanup; rm -f "$BUILD_LOG"' EXIT

echo "==> Building"
npm run build >"$BUILD_LOG" 2>&1 || {
  cat "$BUILD_LOG" >&2
  exit 1
}

# The proxy has to be registered or every assertion below is meaningless —
# the layout guards would redirect and the run would look like a pass.
echo "==> Checking the proxy is registered"
if ! grep -q "Proxy (Middleware)" "$BUILD_LOG"; then
  echo "FAIL: the build does not report a Proxy." >&2
  echo "      It must sit beside app/ — src/proxy.ts in this repository." >&2
  echo "      At the repository root Next.js silently ignores it, which" >&2
  echo "      also means sessions are never refreshed." >&2
  exit 1
fi
echo "    ok"

echo "==> Serving on $PORT"
npm run start -- --port "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$BASE/" 2>/dev/null)" = "200" ]; then
    break
  fi
  sleep 1
done

failures=0

# expect <path> <code> <location-substring-or-dash>
expect() {
  local path="$1" want_code="$2" want_loc="$3"
  local headers code loc

  # `|| true` on the grep: a 200 has no Location header, and under
  # `set -e` a failing command substitution would abort the whole run.
  headers="$(curl -s -o /dev/null -D - --max-time 10 "$BASE$path" 2>/dev/null | tr -d '\r' || true)"
  code="$(printf '%s' "$headers" | head -1 | awk '{print $2}')"
  loc="$(printf '%s' "$headers" | grep -i '^location:' | sed 's/[Ll]ocation: //' || true)"

  if [ "$code" != "$want_code" ]; then
    printf 'FAIL %-38s expected %s, got %s\n' "$path" "$want_code" "$code"
    failures=$((failures + 1))
    return
  fi

  if [ "$want_loc" != "-" ] && [[ "$loc" != *"$want_loc"* ]]; then
    printf 'FAIL %-38s expected Location containing %s, got %s\n' \
      "$path" "$want_loc" "${loc:-none}"
    failures=$((failures + 1))
    return
  fi

  printf 'ok   %-38s %s %s\n' "$path" "$code" "${loc:-}"
}

echo
echo "==> Public routes stay reachable"
expect /               200 -
expect /auth/login     200 -
expect /auth/register  200 -
expect /favicon.ico    200 -

echo
echo "==> Protected routes redirect, carrying the intended path"
for path in \
  /citizen /citizen/report /citizen/complaints /citizen/profile \
  /citizen/notifications /citizen/map \
  /officer /officer/work-orders /officer/profile \
  /government /government/analytics /government/complaints \
  /government/wards /government/map /government/departments
do
  # %2F is the encoded leading slash of the path in ?next=
  expect "$path" 307 "/auth/login?next=%2F"
done

echo
echo "==> A query string on a protected route is preserved for the return trip"
expect "/citizen/complaints?filter=open" 307 "next=%2Fcitizen%2Fcomplaints%3Ffilter%3Dopen"

echo
echo "==> The removed debug route is gone"
expect /api/test-supabase 404 -

echo
if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed." >&2
  exit 1
fi

echo "All route protection checks passed."
