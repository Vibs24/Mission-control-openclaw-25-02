# Flask + SQLite Employee Notes App

Minimal, fully runnable app with:
- Secure login/logout (hashed password via Werkzeug)
- Employee CRUD
- Note CRUD (notes belong to employees)
- SQLite schema
- Seed script (`admin` + sample employee + sample notes)
- Basic pytest coverage (auth + CRUD flow)

## Structure

```
app/
  __init__.py
  db.py
  main.py
  templates/
    base.html
    dashboard.html
    login.html
app.py
schema.sql
seed.py
tests/test_app.py
requirements.txt
```

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Initialize and seed database

```bash
python seed.py
```

Default seeded credentials:
- username: `admin`
- password: `admin123`

## Run

```bash
flask --app app run --debug
```

Then open: `http://127.0.0.1:5000`

## Test

```bash
pytest -q
```
