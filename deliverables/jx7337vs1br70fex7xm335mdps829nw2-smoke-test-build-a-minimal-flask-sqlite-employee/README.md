# Minimal Flask + SQLite Employee Notes App

## Features
- Login/logout (Flask-Login)
- Employee CRUD (create/delete)
- Notes CRUD (create/delete) per employee
- SQLite persistence
- Seed script
- Basic pytest smoke tests

## Setup
```bash
python3 -m pip install -r requirements.txt
python3 seed.py
python3 app.py
```
Open http://127.0.0.1:5000

Default credentials:
- username: `admin`
- password: `admin123`

## Run tests
```bash
python3 -m pytest -q
```

## Files
- `app.py` main app + schema
- `seed.py` seed data
- `templates/` UI
- `tests/test_app.py` tests
