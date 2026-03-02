# Mission Control Reliability Dashboard

Flask + SQLite + HTML/CSS/JS dashboard with:
- Role-based auth (admin/reviewer/viewer)
- Live task board (auto-refresh indicator)
- Blocked/Stuck RCA panel
- Agent utilization widgets
- CSV export (`/export/tasks.csv`)
- Seed data and basic tests

## Quick Start
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 seed.py
flask --app app run --debug
```

Login users:
- admin / admin123
- reviewer / review123
- viewer / viewer123

## Run tests
```bash
pytest -q
```
