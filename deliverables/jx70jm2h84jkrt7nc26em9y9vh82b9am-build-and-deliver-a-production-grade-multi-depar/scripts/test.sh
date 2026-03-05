#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

export PYTHONPATH="$ROOT_DIR/.pydeps:${PYTHONPATH:-}"
if python3 -c "import pytest" >/dev/null 2>&1; then
  python3 -m pytest -q tests
else
  echo "[test] pytest not available, using unittest discovery fallback"
  python3 -m unittest discover -s tests -p "test_*.py" -v
fi
