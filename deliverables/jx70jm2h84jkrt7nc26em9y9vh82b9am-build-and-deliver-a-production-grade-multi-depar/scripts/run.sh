#!/usr/bin/env bash
set -euo pipefail
source /tmp/workforce-venv/bin/activate
export FLASK_APP=app:create_app
flask run --host 0.0.0.0 --port 5060
