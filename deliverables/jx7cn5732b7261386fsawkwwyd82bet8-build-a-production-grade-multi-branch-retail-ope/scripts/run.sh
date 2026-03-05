#!/usr/bin/env bash
set -euo pipefail
source /tmp/retailops-venv-jx7cn/bin/activate
export FLASK_APP=app.py
flask run --host=0.0.0.0 --port=5000
