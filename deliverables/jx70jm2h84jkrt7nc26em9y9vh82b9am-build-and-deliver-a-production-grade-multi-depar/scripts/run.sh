#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV=/tmp/workforce-jx70-venv
source "$VENV/bin/activate"
cd "$DIR"
python app.py
