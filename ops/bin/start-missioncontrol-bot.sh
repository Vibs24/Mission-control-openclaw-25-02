#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
APP_DIR="$ROOT/Mission-control"
LOG_DIR="$APP_DIR/orchestrator/logs"
mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

"$ROOT/ops/bin/wait-for-network.sh" "api.telegram.org" "secret-fox-493.convex.cloud"

cd "$APP_DIR"
if ! AGENT_SYNC_OUTPUT=$(/opt/homebrew/bin/node orchestrator/agent-sync.mjs --mode startup 2>&1); then
  if echo "$AGENT_SYNC_OUTPUT" | grep -qi "lock already held"; then
    echo "[start-missioncontrol-bot] INFO: startup agent sync skipped (lock held by active sync run)" >&2
  else
    echo "$AGENT_SYNC_OUTPUT" >&2
    echo "[start-missioncontrol-bot] WARN: startup agent sync failed; continuing bot startup" >&2
  fi
fi
exec /opt/homebrew/bin/node orchestrator/index.mjs
