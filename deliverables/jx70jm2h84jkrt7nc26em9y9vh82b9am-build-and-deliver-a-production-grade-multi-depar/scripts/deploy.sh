#!/usr/bin/env bash
set -euo pipefail
python3 -m venv /tmp/wcc-venv
source /tmp/wcc-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
echo "Deploy-ready local setup complete. Start with: source /tmp/wcc-venv/bin/activate && python run.py"