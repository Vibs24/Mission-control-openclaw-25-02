#!/usr/bin/env bash
set -euo pipefail
ART_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ART_DIR"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python scripts/seed.py
export FLASK_APP=app.py
export SECRET_KEY="${SECRET_KEY:-please-change-me}"
nohup flask run --host 0.0.0.0 --port 5055 > app.log 2>&1 &
echo "Deployed. App listening on http://127.0.0.1:5055"
