#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:5000}"
OUT="${2:-./evidence/smoke-test-output.txt}"
mkdir -p "$(dirname "$OUT")"

log(){ echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$OUT"; }

: > "$OUT"
log "Smoke test start: $BASE_URL"

check_http(){
  local path="$1"
  local code
  code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$BASE_URL$path")
  log "GET $path -> $code"
  [[ "$code" =~ ^2|3 ]] || { log "FAIL: $path"; exit 1; }
}

check_http "/"
check_http "/login"

# Optional endpoints if app implements them
for p in "/api/tasks" "/export/tasks.csv"; do
  code=$(curl -s -o /tmp/smoke_body.txt -w "%{http_code}" "$BASE_URL$p" || true)
  log "GET $p -> $code"
done

log "Smoke test PASS"
