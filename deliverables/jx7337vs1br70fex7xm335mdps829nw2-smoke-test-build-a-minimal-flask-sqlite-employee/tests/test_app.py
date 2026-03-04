import os
import tempfile
import pytest
from app import create_app, db
from app.models import User


@pytest.fixture
def client():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        "SECRET_KEY": "test-key",
    })

    with app.app_context():
        db.create_all()
        u = User(username="admin")
        u.set_password("admin123")
        db.session.add(u)
        db.session.commit()

    with app.test_client() as client:
        yield client

    os.close(db_fd)
    os.unlink(db_path)


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_and_access_employees(client):
    rv = login(client)
    assert b"Employee List" in rv.data


def test_employee_and_note_crud(client):
    login(client)
    rv = client.post("/employees", data={"name": "Jane Doe", "email": "jane@example.com"}, follow_redirects=True)
    assert b"Employee created" in rv.data

    rv = client.post(
        "/notes",
        data={"title": "Welcome note", "body": "Started today", "employee_id": "1"},
        follow_redirects=True,
    )
    assert b"Note created" in rv.data

    rv = client.post(
        "/notes/1/edit",
        data={"title": "Welcome note v2", "body": "Updated", "employee_id": "1"},
        follow_redirects=True,
    )
    assert b"Note updated" in rv.data


def test_protected_route_redirects(client):
    rv = client.get("/employees")
    assert rv.status_code == 302
    assert "/login" in rv.location
