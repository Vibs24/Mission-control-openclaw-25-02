#!/usr/bin/env bash
set -euo pipefail
python3 -m venv /tmp/collabpm-venv
source /tmp/collabpm-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
echo 'Setup complete'
