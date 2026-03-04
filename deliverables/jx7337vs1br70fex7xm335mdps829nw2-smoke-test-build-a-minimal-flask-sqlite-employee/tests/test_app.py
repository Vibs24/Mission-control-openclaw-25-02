from app.main import create_app
from app.db import init_db, seed_db


def make_client(tmp_path):
    db_path = tmp_path / "test.sqlite"
    app = create_app({"TESTING": True, "SECRET_KEY": "test", "DATABASE": str(db_path)})
    with app.app_context():
        init_db()
        seed_db()
    return app.test_client()


def login(client):
    return client.post("/login", data={"username": "admin", "password": "admin123"}, follow_redirects=True)


def test_login_and_list_notes(tmp_path):
    client = make_client(tmp_path)
    res = login(client)
    assert res.status_code == 200
    assert b"Employee Notes" in res.data
    assert b"Alice" in res.data


def test_create_update_delete_note(tmp_path):
    client = make_client(tmp_path)
    login(client)

    create_res = client.post(
        "/notes/create",
        data={"employee_name": "Carol", "title": "1:1", "content": "Weekly sync"},
        follow_redirects=True,
    )
    assert b"Carol" in create_res.data

    list_res = client.get("/")
    assert b"1:1" in list_res.data

    # Find note id by looking for edit URL from content page
    assert b"/notes/" in list_res.data

    # Update and delete known seeded ID pattern by creating deterministic single app run:
    edit_res = client.post(
        "/notes/3/edit",
        data={"employee_name": "Carol", "title": "Updated", "content": "Done"},
        follow_redirects=True,
    )
    assert b"Updated" in edit_res.data

    delete_res = client.post("/notes/3/delete", follow_redirects=True)
    assert b"Updated" not in delete_res.data


def test_requires_auth(tmp_path):
    client = make_client(tmp_path)
    res = client.get("/", follow_redirects=True)
    assert b"Login" in res.data
