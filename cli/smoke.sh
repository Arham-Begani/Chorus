#!/usr/bin/env bash
# Exercise the reporter agent end to end: report, duplicate rejection, threshold.
#
# Works against either agent mode — the HTTP surface is identical, which is the
# point. Against `local` it proves the circuits behave; against a testnet agent
# it is M3, M4 and M5.
set -uo pipefail

AGENT="${CHORUS_AGENT_URL:-http://127.0.0.1:3001}"
HANDLE="${1:-scammer-smoke-$$@upi}"

post() {
  curl -s -w '\n  HTTP %{http_code}\n' -X POST "$AGENT/$1" \
    -H 'Content-Type: application/json' \
    --data-raw "{\"reporter\":\"$2\",\"handle\":\"$HANDLE\"}"
}

echo "agent:  $AGENT"
echo "handle: $HANDLE"
echo
echo "=== status ==="
curl -s "$AGENT/api/status"; echo; echo

echo "=== derive as A, then B (same handle) ==="
echo "A:"; post api/derive A
echo "B:"; post api/derive B
echo "^ commitments must MATCH (same handle), nullifiers must DIFFER (different keys)"
echo

echo "=== M3: A reports -> count 1 ==="
post api/report A
echo

echo "=== M4: A reports the same handle again -> must be rejected with 409 ==="
post api/report A
echo

echo "=== B reports -> count 2, still unmatched ==="
post api/report B
echo

echo "=== M5: C reports -> count 3, threshold flips ==="
post api/report C
echo

echo "=== public ledger ==="
curl -s "$AGENT/api/ledger"; echo
