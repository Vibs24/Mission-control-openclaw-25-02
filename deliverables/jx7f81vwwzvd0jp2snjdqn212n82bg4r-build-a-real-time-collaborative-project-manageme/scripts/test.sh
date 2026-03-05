#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/.venv_path" ]]; then echo "Run scripts/setup.sh first"; exit 1; fi
VENV="$(cat "$ROOT/.venv_path")"
SAFE_ROOT="/tmp/collabflow_src_$(echo -n "$ROOT" | shasum | awk '{print $1}')"
ln -sfn "$ROOT" "$SAFE_ROOT"
cd "$SAFE_ROOT"
export PYTHONPATH="$SAFE_ROOT"
exec "$VENV/bin/pytest" -q