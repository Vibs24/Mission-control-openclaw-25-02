#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
APP_DIR="$ROOT/Mission-control"
SAFE_ROOT="${MISSION_CONTROL_CONVEX_SAFE_ROOT:-$HOME/mission-control-openclaw-25-02-safe}"
SAFE_APP="$SAFE_ROOT/Mission-control"

if ! command -v rsync >/dev/null 2>&1; then
  echo "[convex-safe-push] rsync is required but not available." >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "[convex-safe-push] Mission Control app directory not found: $APP_DIR" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  set -- dev --once
fi

if [[ "$APP_DIR" != *:* ]]; then
  cd "$APP_DIR"
  exec ./node_modules/.bin/convex "$@"
fi

mkdir -p "$SAFE_ROOT"

rsync -a --delete \
  --exclude '/.git' \
  --exclude '/dist' \
  --exclude '/orchestrator/logs' \
  --exclude '/Mission-control/orchestrator/logs' \
  "$APP_DIR/" "$SAFE_APP/"

cd "$SAFE_APP"

if [ ! -x "./node_modules/.bin/convex" ]; then
  echo "[convex-safe-push] Installing dependencies in safe mirror..." >&2
  npm ci >/dev/null
fi

echo "[convex-safe-push] Running convex $* from safe path: $SAFE_APP" >&2
exec ./node_modules/.bin/convex "$@"
