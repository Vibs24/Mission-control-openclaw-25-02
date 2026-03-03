#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
APP_DIR="$ROOT/Mission-control"
mkdir -p "$APP_DIR/orchestrator/logs"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Wait briefly for network/backend DNS during boot, then start UI server.
NETWORK_WAIT_MAX_ATTEMPTS="${NETWORK_WAIT_MAX_ATTEMPTS:-24}" \
NETWORK_WAIT_SLEEP_SEC="${NETWORK_WAIT_SLEEP_SEC:-5}" \
  "$ROOT/ops/bin/wait-for-network.sh" "secret-fox-493.convex.cloud" || true

cd "$APP_DIR"

while /usr/sbin/lsof -nP -iTCP:5174 -sTCP:LISTEN >/dev/null 2>&1; do
  echo "[dashboard] port 5174 already in use; waiting for it to become free"
  sleep 10
done

exec "$APP_DIR/node_modules/.bin/vite" --host 127.0.0.1 --port 5174 --strictPort
