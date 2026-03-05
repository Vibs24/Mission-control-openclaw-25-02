#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[setup] root: $ROOT_DIR"
python3 -m venv .venv

INSTALL_OK=0
if [ -x ".venv/bin/python" ] && .venv/bin/python -m pip --version >/dev/null 2>&1; then
  if .venv/bin/python -m pip install --upgrade pip >/dev/null 2>&1; then
    echo "[setup] upgraded pip in .venv"
  fi
  if .venv/bin/python -m pip install -r requirements.txt; then
    INSTALL_OK=1
    echo "[setup] dependencies installed into .venv"
  fi
fi

if [ "$INSTALL_OK" -eq 0 ]; then
  echo "[setup] .venv pip install unavailable or failed. Trying .pydeps fallback"
  mkdir -p .pydeps
  if python3 -m pip install --target .pydeps -r requirements.txt; then
    INSTALL_OK=1
    echo "[setup] dependencies installed into .pydeps"
  fi
fi

if [ "$INSTALL_OK" -eq 0 ]; then
  echo "[setup] WARNING: dependency install failed. Continuing with system Python packages and PYTHONPATH=.pydeps"
fi

echo "[setup] initializing and seeding database"
PYTHONPATH="$ROOT_DIR/.pydeps:${PYTHONPATH:-}" python3 scripts/seed.py

echo "[setup] complete"
