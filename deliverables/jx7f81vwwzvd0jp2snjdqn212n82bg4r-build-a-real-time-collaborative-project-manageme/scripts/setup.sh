#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="/tmp/collabflow_venv_$(echo -n "$ROOT" | shasum | awk '{print $1}')"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -r "$ROOT/requirements.txt"
echo "$VENV" > "$ROOT/.venv_path"
echo "Setup complete. Venv: $VENV"