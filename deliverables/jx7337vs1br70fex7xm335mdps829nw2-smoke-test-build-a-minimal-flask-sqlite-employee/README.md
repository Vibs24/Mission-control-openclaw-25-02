# Smoke Test: Minimal Flask + SQLite Employee Notes App

Minimal, runnable employee-notes app for smoke validation.

## Features
- Secure login/logout (Flask-Login + password hashing)
- Employee CRUD (create/list/delete)
- Employee note CRUD (create/edit/delete)
- SQLite backing store
- Seed script with default admin and sample records
- Basic pytest smoke tests

## Setup
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Seed database
```bash
python seed_data.py
```
Default login: `admin / admin123`

## Run
```bash
python run.py
```
Open: http://127.0.0.1:5000

## Test
```bash
pytest -q
```

## Project files
- `app/` Flask package (models/routes/templates)
- `run.py` app entrypoint
- `seed_data.py` seed loader
- `tests/test_app.py` smoke tests
