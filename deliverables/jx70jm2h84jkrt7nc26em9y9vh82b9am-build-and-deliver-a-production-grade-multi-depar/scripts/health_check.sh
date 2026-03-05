#!/usr/bin/env bash
set -euo pipefail
python - <<'PY'
from app import create_app
from app.models import User, Employee
app = create_app()
with app.app_context():
    print('HEALTH_OK users=', User.query.count(), 'employees=', Employee.query.count())
PY