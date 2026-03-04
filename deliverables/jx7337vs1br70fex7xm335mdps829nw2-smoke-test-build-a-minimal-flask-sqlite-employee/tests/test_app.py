from app import create_app
from app.db import get_db, init_db, seed_db
from werkzeug.security import check_password_hash


def make_client(tmp_path):
    db_path = tmp_path / "test.sqlite"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "DATABASE": str(db_path),
        }
    )
    with app.app_context():
        init_db()
        seed_db()
    return app, app.test_client()


def login(client, username="admin", password="admin123"):
    return client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=True,
    )


def test_auth_login_logout_and_hashed_password(tmp_path):
    app, client = make_client(tmp_path)

    protected = client.get("/dashboard", follow_redirects=True)
    assert protected.status_code == 200
    assert b"Login" in protected.data

    bad_login = login(client, password="wrong-password")
    assert b"Invalid credentials." in bad_login.data

    success_login = login(client)
    assert b"Employee Notes Dashboard" in success_login.data
    assert b"Alice Johnson" in success_login.data

    with app.app_context():
        db = get_db()
        admin = db.execute(
            "SELECT username, password_hash FROM users WHERE username = ?", ("admin",)
        ).fetchone()
        assert admin is not None
        assert admin["password_hash"] != "admin123"
        assert check_password_hash(admin["password_hash"], "admin123")

    logout = client.get("/logout", follow_redirects=True)
    assert b"Login" in logout.data


def test_employee_and_note_crud_flow(tmp_path):
    app, client = make_client(tmp_path)
    login(client)

    create_employee = client.post(
        "/employees",
        data={"name": "Bob Stone", "email": "bob@example.com"},
        follow_redirects=True,
    )
    assert create_employee.status_code == 200
    assert b"Bob Stone" in create_employee.data

    with app.app_context():
        db = get_db()
        employee = db.execute(
            "SELECT id FROM employees WHERE email = ?", ("bob@example.com",)
        ).fetchone()
        assert employee is not None
        employee_id = employee["id"]

    create_note = client.post(
        f"/employees/{employee_id}/notes",
        data={"content": "Initial performance note"},
        follow_redirects=True,
    )
    assert b"Initial performance note" in create_note.data

    with app.app_context():
        db = get_db()
        note = db.execute(
            "SELECT id FROM notes WHERE employee_id = ? ORDER BY id DESC LIMIT 1",
            (employee_id,),
        ).fetchone()
        assert note is not None
        note_id = note["id"]

    update_employee = client.post(
        f"/employees/{employee_id}/update",
        data={"name": "Robert Stone", "email": "robert@example.com"},
        follow_redirects=True,
    )
    assert b"Robert Stone" in update_employee.data

    update_note = client.post(
        f"/notes/{note_id}/update",
        data={"content": "Updated performance note"},
        follow_redirects=True,
    )
    assert b"Updated performance note" in update_note.data

    delete_note = client.post(f"/notes/{note_id}/delete", follow_redirects=True)
    assert b"Updated performance note" not in delete_note.data

    delete_employee = client.post(
        f"/employees/{employee_id}/delete",
        follow_redirects=True,
    )
    assert b"Robert Stone" not in delete_employee.data
