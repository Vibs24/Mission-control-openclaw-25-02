#!/usr/bin/env bash
set -euo pipefail
python3 -m venv /tmp/retailops-venv
source /tmp/retailops-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
echo "Setup complete. Activate with: source /tmp/retailops-venv/bin/activate"