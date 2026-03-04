# Minimal Flask + SQLite Employee Notes App

Smoke-test implementation of a runnable Flask app with login, employee CRUD, note CRUD, SQLite schema, seed data, and basic tests.

## Features

- Login/logout (`Flask-Login`)
- Employee CRUD (create/list/delete)
- Employee Notes CRUD (create/list/edit/delete)
- SQLite persistence via SQLAlchemy models (`User`, `Employee`, `Note`)
- Seed script for demo data
- Basic pytest suite

## Setup

```bash
python3 -m venv /tmp/employee-notes-venv
source /tmp/employee-notes-venv/bin/activate
pip install -r requirements.txt
python seed_data.py
python run.py
```

App URL: `http://127.0.0.1:5000`

Default seeded credentials:
- username: `admin`
- password: `admin123`

## Run Tests

```bash
source /tmp/employee-notes-venv/bin/activate
pytest -q
```

## Project Layout

```
.
├── app/
│   ├── __init__.py
│   ├── models.py
│   ├── routes.py
│   └── templates/
├── tests/test_app.py
├── seed_data.py
├── run.py
└── requirements.txt
```
