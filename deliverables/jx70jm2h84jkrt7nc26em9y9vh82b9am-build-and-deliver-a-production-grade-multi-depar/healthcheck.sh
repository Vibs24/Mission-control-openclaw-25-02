#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PY'
from app import create_app
from app.models import db, User
app=create_app({'SQLALCHEMY_DATABASE_URI':'sqlite:///workforce.db'})
with app.app_context():
    db.session.execute(db.select(User).limit(1)).first()
print('HEALTHCHECK_OK')
PY
