#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV=/tmp/workforce-jx70-venv
python3 -m venv "$VENV"
source "$VENV/bin/activate"
pip install -q -r "$DIR/requirements.txt"
python "$DIR/scripts/seed.py"
echo "Setup complete"
