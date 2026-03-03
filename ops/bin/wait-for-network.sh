#!/bin/zsh
set -euo pipefail

HOSTS=("$@")
if [ ${#HOSTS[@]} -eq 0 ]; then
  HOSTS=("api.telegram.org" "secret-fox-493.convex.cloud")
fi

max_attempts="${NETWORK_WAIT_MAX_ATTEMPTS:-0}"
sleep_sec="${NETWORK_WAIT_SLEEP_SEC:-5}"
attempt=0

while true; do
  all_ok=1
  for host in "${HOSTS[@]}"; do
    if ! /usr/bin/nc -zw3 "$host" 443 >/dev/null 2>&1; then
      all_ok=0
      break
    fi
  done

  if [ "$all_ok" -eq 1 ]; then
    exit 0
  fi

  attempt=$((attempt + 1))
  if [ "$max_attempts" -gt 0 ] && [ "$attempt" -ge "$max_attempts" ]; then
    echo "[wait-for-network] network not ready after $attempt attempts" >&2
    exit 1
  fi
  sleep "$sleep_sec"
done

