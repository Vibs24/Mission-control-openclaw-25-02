# Asset Register (Flask + SQLite)

Features:
- Login/logout (seeded admin user)
- Asset CRUD
- Search + filter (category/status)
- Pagination
- CSV export of current filter set
- Seed script

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 seed.py
flask --app app run --debug
```

Open http://127.0.0.1:5000

Login: `admin / admin123`
