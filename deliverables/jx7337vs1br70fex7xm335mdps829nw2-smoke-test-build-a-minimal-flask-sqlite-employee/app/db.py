import sqlite3
from pathlib import Path

from flask import current_app, g
from werkzeug.security import generate_password_hash


def get_db():
    if "db" not in g:
        db = sqlite3.connect(current_app.config["DATABASE"])
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    schema_path = Path(current_app.root_path).parent / "schema.sql"
    with open(schema_path, "r", encoding="utf-8") as schema_file:
        db.executescript(schema_file.read())
    db.commit()


def seed_db(admin_username="admin", admin_password="admin123"):
    db = get_db()

    db.execute(
        "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)",
        (admin_username, generate_password_hash(admin_password)),
    )

    employee = db.execute(
        "SELECT id FROM employees WHERE email = ?", ("alice@example.com",)
    ).fetchone()

    if employee is None:
        cursor = db.execute(
            "INSERT INTO employees (name, email) VALUES (?, ?)",
            ("Alice Johnson", "alice@example.com"),
        )
        employee_id = cursor.lastrowid
    else:
        employee_id = employee["id"]

    existing_notes = db.execute(
        "SELECT COUNT(1) AS note_count FROM notes WHERE employee_id = ?", (employee_id,)
    ).fetchone()

    if existing_notes["note_count"] == 0:
        db.executemany(
            "INSERT INTO notes (employee_id, content) VALUES (?, ?)",
            [
                (employee_id, "Onboarded successfully."),
                (employee_id, "Needs laptop upgrade next quarter."),
            ],
        )

    db.commit()
