import pytest
from werkzeug.security import generate_password_hash

from app import create_app, get_db


@pytest.fixture()
def app(tmp_path):
    db_path = tmp_path / "test_workforce.db"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "DATABASE": str(db_path),
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

    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username, password):
    return client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=True,
    )
