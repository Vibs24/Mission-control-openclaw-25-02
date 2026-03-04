import tempfile
import pytest
from app import create_app, db
from app.models import Department, User


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
        db.session.add(Department(name="Engineering", description="desc"))
        db.session.commit()

    with app.test_client() as client:
        yield client


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_and_dashboard(client):
    rv = login(client)
    assert b"Employees" in rv.data


def test_create_department(client):
    login(client)
    rv = client.post("/departments", data={"name": "Finance", "description": "Accounting"}, follow_redirects=True)
    assert b"Department added" in rv.data


def test_protected_route_requires_auth(client):
    rv = client.get("/employees")
    assert rv.status_code == 302
    assert "/login" in rv.location
