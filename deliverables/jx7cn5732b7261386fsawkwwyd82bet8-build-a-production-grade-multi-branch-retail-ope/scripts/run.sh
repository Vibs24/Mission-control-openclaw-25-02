#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFE_NAME="$(basename "$ROOT_DIR" | tr -cd '[:alnum:]_-')"
DEFAULT_VENV="/tmp/${SAFE_NAME:-retailops}-venv"
VENV_DIR="${VENV_DIR:-$DEFAULT_VENV}"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Virtualenv not found at $VENV_DIR. Run ./scripts/setup.sh first."
  exit 1
fi

source "$VENV_DIR/bin/activate"
PYTHON_BIN="$VENV_DIR/bin/python"
if [[ -x "$VENV_DIR/bin/python3" ]]; then
  PYTHON_BIN="$VENV_DIR/bin/python3"
fi

export PYTHONPATH="$ROOT_DIR/.pydeps:$ROOT_DIR:${PYTHONPATH:-}"
export FLASK_APP=app.py
export FLASK_ENV=production

cd "$ROOT_DIR"
"$PYTHON_BIN" -m flask run --host=0.0.0.0 --port=5000
