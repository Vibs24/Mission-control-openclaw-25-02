import tempfile
from datetime import date

import pytest

from app import create_app, db
from app.models import Department, Employee, User


@pytest.fixture
def client():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "SECRET_KEY": "test-key",
        }
    )
    with app.app_context():
        db.create_all()
        u = User(username="admin")
        u.set_password("admin123")
        db.session.add(u)
        eng = Department(name="Engineering", description="desc")
        db.session.add(eng)
        db.session.flush()
        db.session.add(
            Employee(
                employee_code="EMP001",
                full_name="Amit Rao",
                email="amit@example.com",
                role="Engineer",
                status="Active",
                joining_date=date(2025, 1, 1),
                department_id=eng.id,
            )
        )
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


def test_update_employee(client):
    login(client)
    rv = client.post(
        "/employees/1/edit",
        data={
            "employee_code": "EMP001",
            "full_name": "Amit Rao Updated",
            "email": "amit@example.com",
            "role": "Senior Engineer",
            "status": "Active",
            "joining_date": "2025-01-01",
            "department_id": "1",
        },
        follow_redirects=True,
    )
    assert b"Employee updated" in rv.data
    assert b"Amit Rao Updated" in rv.data


def test_csv_export_requires_auth(client):
    rv = client.get("/export/employees.csv")
    assert rv.status_code == 302
    assert "/login" in rv.location


def test_protected_route_requires_auth(client):
    rv = client.get("/employees")
    assert rv.status_code == 302
    assert "/login" in rv.location
