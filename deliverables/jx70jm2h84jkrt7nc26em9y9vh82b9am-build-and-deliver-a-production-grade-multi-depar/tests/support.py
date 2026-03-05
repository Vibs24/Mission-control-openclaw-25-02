import os
import shutil
import tempfile

from werkzeug.security import generate_password_hash

from app import create_app, get_db


def build_test_app():
    temp_dir = tempfile.mkdtemp(prefix="workforce_test_")
    db_path = os.path.join(temp_dir, "test.db")

    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "DATABASE": db_path,
        }
    )

    with app.app_context():
        db = get_db()
        db.execute(
            """
            INSERT INTO users (username, password_hash, role, full_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (
                "manager",
                generate_password_hash("manager123", method="pbkdf2:sha256"),
                "Manager",
                "Manager User",
            ),
        )
        db.execute(
            """
            INSERT INTO users (username, password_hash, role, full_name)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (
                "reviewer",
                generate_password_hash("reviewer123", method="pbkdf2:sha256"),
                "Reviewer",
                "Reviewer User",
            ),
        )
        db.execute(
            """
            INSERT INTO employees
            (employee_code, full_name, email, department, title, status, hourly_rate, hire_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "EMP100",
                "Test Employee",
                "test.employee@example.com",
                "Engineering",
                "Engineer",
                "Active",
                40.0,
                "2024-01-01",
            ),
        )
        db.commit()

    return app, temp_dir


def cleanup_temp_dir(path):
    if path and os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)
