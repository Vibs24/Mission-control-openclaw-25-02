#!/usr/bin/env bash
set -euo pipefail
python3 -m venv /tmp/teamflow-venv
source /tmp/teamflow-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
echo 'Setup complete. Use: source /tmp/teamflow-venv/bin/activate && python run.py'