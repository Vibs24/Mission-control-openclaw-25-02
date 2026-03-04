import pytest
from app import create_app
from app.models import db, User, Department


@pytest.fixture()
def client():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "WTF_CSRF_ENABLED": False,
    })
    with app.app_context():
        db.create_all()
        user = User(username="admin")
        user.set_password("admin123")
        dep = Department(name="Engineering", location="Pune")
        db.session.add_all([user, dep])
        db.session.commit()
    return app.test_client()


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_and_dashboard(client):
    r = login(client)
    assert r.status_code == 200
    assert b"Audit Timeline" in r.data


def test_create_employee(client):
    login(client)
    r = client.post("/employees", data={
        "full_name": "Test User",
        "email": "test@example.com",
        "role": "Engineer",
        "department_id": 1,
    }, follow_redirects=True)
    assert r.status_code == 200
    assert b"Test User" in r.data


def test_export_csv_requires_auth(client):
    r = client.get("/export/employees")
    assert r.status_code in (302, 401)
