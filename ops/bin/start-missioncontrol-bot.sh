#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
APP_DIR="$ROOT/Mission-control"
LOG_DIR="$APP_DIR/orchestrator/logs"
mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export OPENCLAW_PROFILE="${OPENCLAW_PROFILE:-mc2}"
export OPENCLAW_CONFIG_STRICT_STARTUP="${OPENCLAW_CONFIG_STRICT_STARTUP:-true}"

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

if ! /opt/homebrew/bin/node orchestrator/scripts/sync-openclaw-config.mjs --mode startup; then
  echo "[start-missioncontrol-bot] ERROR: openclaw config sync failed" >&2
  if [[ "$OPENCLAW_CONFIG_STRICT_STARTUP" == "true" ]]; then
    exit 1
  fi
fi

DRIFT_ARGS=(orchestrator/scripts/check-config-drift.mjs --mode startup)
if [[ "$OPENCLAW_CONFIG_STRICT_STARTUP" == "true" ]]; then
  DRIFT_ARGS+=(--strict)
fi
if ! /opt/homebrew/bin/node "${DRIFT_ARGS[@]}"; then
  echo "[start-missioncontrol-bot] ERROR: openclaw config drift check failed" >&2
  if [[ "$OPENCLAW_CONFIG_STRICT_STARTUP" == "true" ]]; then
    exit 1
  fi
fi

/opt/homebrew/bin/node orchestrator/scripts/provision-role-agents.mjs
/opt/homebrew/bin/node orchestrator/scripts/migrate-role-routing.mjs
exec /opt/homebrew/bin/node orchestrator/index.mjs
