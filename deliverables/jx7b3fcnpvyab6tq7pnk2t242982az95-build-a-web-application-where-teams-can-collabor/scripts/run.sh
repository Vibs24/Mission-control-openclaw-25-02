#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source /tmp/teamflow-venv/bin/activate
export FLASK_APP=run:create_app
flask run --host 0.0.0.0 --port 5070
