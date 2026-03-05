#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

export PYTHONPATH="$ROOT_DIR/.pydeps:${PYTHONPATH:-}"
export FLASK_RUN_HOST="${FLASK_RUN_HOST:-127.0.0.1}"
export FLASK_RUN_PORT="${FLASK_RUN_PORT:-5000}"

python3 app.py
