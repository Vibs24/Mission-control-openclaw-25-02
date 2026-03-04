import sqlite3
from pathlib import Path
from flask import current_app, g


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    schema = Path(current_app.root_path).parent / "schema.sql"
    with open(schema, "r", encoding="utf-8") as f:
        db.executescript(f.read())
    db.commit()


def seed_db():
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)",
        ("admin", "admin123"),
    )
    db.executemany(
        "INSERT INTO notes (employee_name, title, content, created_by) VALUES (?, ?, ?, ?)",
        [
            ("Alice", "Onboarding", "Completed onboarding documentation", "admin"),
            ("Bob", "Performance", "Q1 goals reviewed", "admin"),
        ],
    )
    db.commit()
