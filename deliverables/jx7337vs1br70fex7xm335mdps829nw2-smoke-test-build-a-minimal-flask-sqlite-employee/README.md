# Minimal Flask + SQLite Employee Notes App

A smoke-test-ready Flask application with:
- Login / logout
- Employee note CRUD
- SQLite schema + seed script
- Basic tests with pytest

## Project Structure

```
app/
  main.py
  db.py
  templates/
schema.sql
seed.py
tests/
requirements.txt
```

## Setup

```bash
python3 -m venv /tmp/employee-notes-venv
source /tmp/employee-notes-venv/bin/activate
pip install -r requirements.txt
```

## Initialize DB + Seed Data

```bash
python seed.py
```

Default login:
- username: `admin`
- password: `admin123`

## Run

```bash
export FLASK_APP=app.main:create_app
flask run --debug
```

Open `http://127.0.0.1:5000`.

## Test

```bash
pytest -q
```
