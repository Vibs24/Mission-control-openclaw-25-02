from app import create_app, db
from app.models import User, Employee, Note


def setup_client():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SECRET_KEY": "test-secret",
    })
    with app.app_context():
        db.create_all()
        u = User(username="admin")
        u.set_password("admin123")
        e = Employee(name="Test Emp", email="test@example.com")
        db.session.add_all([u, e])
        db.session.commit()
    return app.test_client(), app


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_redirect_for_protected_route():
    client, _ = setup_client()
    r = client.get("/employees")
    assert r.status_code == 302


def test_create_update_delete_note_flow():
    client, app = setup_client()
    login(client)

    created = client.post("/notes", data={"title": "First Note", "body": "hello", "employee_id": 1}, follow_redirects=True)
    assert b"First Note" in created.data

    with app.app_context():
        nid = db.session.query(Note.id).filter_by(title="First Note").scalar()

    updated = client.post(f"/notes/{nid}/edit", data={"title": "Updated Note", "body": "bye", "employee_id": 1}, follow_redirects=True)
    assert b"Updated Note" in updated.data

    deleted = client.post(f"/notes/{nid}/delete", follow_redirects=True)
    assert b"Updated Note" not in deleted.data
