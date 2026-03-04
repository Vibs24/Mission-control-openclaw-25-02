import pytest
from werkzeug.security import generate_password_hash
from app import create_app, db, User, Department, Employee

@pytest.fixture()
def client():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "SECRET_KEY": "test"})
    with app.app_context():
        db.create_all()
        db.session.add(User(username="admin", password_hash=generate_password_hash("admin123")))
        dep = Department(name="Engineering")
        db.session.add(dep)
        db.session.flush()
        db.session.add(Employee(name="Test User", email="test@x.com", role="Dev", department_id=dep.id, status="active"))
        db.session.commit()
    with app.test_client() as c:
        yield c


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_and_dashboard(client):
    resp = login(client)
    assert b"Employee Operations Dashboard" in resp.data


def test_create_employee(client):
    login(client)
    resp = client.post("/employees", data={"name": "New Emp", "email": "new@x.com", "role": "QA", "status": "active"}, follow_redirects=True)
    assert b"New Emp" in resp.data


def test_export_csv_requires_auth(client):
    resp = client.get("/export/employees.csv")
    assert resp.status_code == 302
