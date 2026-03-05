#!/usr/bin/env bash
set -euo pipefail
VENV_DIR=/tmp/retailops-venv-jx7cn
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r requirements.txt
python - <<'PY'
from app import create_app
app=create_app()
with app.app_context():
    app.init_db()
    app.seed_data()
print('Database initialized and seeded')
PY
