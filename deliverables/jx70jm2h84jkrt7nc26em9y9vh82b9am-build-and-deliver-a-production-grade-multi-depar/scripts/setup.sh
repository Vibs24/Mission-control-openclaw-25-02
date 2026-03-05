#!/usr/bin/env bash
set -euo pipefail
python3 -m venv /tmp/workforce-venv
source /tmp/workforce-venv/bin/activate
pip install -r requirements.txt
flask --app app:create_app init-db
python3 scripts/seed.py
