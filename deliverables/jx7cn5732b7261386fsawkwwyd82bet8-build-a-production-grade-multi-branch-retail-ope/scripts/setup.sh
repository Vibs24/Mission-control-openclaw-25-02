#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFE_NAME="$(basename "$ROOT_DIR" | tr -cd '[:alnum:]_-')"
DEFAULT_VENV="/tmp/${SAFE_NAME:-retailops}-venv"
VENV_DIR="${VENV_DIR:-$DEFAULT_VENV}"

PY_BOOTSTRAP="$(command -v python3.14 || command -v python3)"
"$PY_BOOTSTRAP" -m venv "$VENV_DIR"

source "$VENV_DIR/bin/activate"
PYTHON_BIN="$VENV_DIR/bin/python"
if [[ -x "$VENV_DIR/bin/python3" ]]; then
  PYTHON_BIN="$VENV_DIR/bin/python3"
fi

"$PYTHON_BIN" -m pip install --upgrade pip >/dev/null || true
PIP_OK=true
if ! "$PYTHON_BIN" -m pip install -r "$ROOT_DIR/requirements.txt"; then
  echo "pip install failed; using local .pydeps fallback via PYTHONPATH"
  PIP_OK=false
fi

export PYTHONPATH="$ROOT_DIR/.pydeps:$ROOT_DIR:${PYTHONPATH:-}"
if [ "$PIP_OK" = false ]; then
  "$PY_BOOTSTRAP" "$ROOT_DIR/scripts/seed.py" --reset
else
  "$PYTHON_BIN" "$ROOT_DIR/scripts/seed.py" --reset
fi

echo "Setup complete"
echo "Virtualenv: $VENV_DIR"
echo "Activate env: source $VENV_DIR/bin/activate"
