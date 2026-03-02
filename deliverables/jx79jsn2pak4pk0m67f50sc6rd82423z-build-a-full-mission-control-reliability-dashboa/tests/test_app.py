import os
import tempfile
import pytest
from app import app, init_db, get_db
from werkzeug.security import generate_password_hash

@pytest.fixture()
def client():
    db_fd, db_path = tempfile.mkstemp()
    app.config.update(TESTING=True, DATABASE=db_path, SECRET_KEY="test")
    with app.app_context():
        init_db()
        db = get_db()
        db.execute("INSERT INTO users (username,password_hash,role) VALUES (?,?,?)", ("admin", generate_password_hash("admin123"), "admin"))
        db.execute("INSERT INTO tasks (title,workflow,status,assigned_agent,utilization_pct) VALUES (?,?,?,?,?)", ("T1","task","in_progress","dev",80))
        db.commit()
    with app.test_client() as c:
        yield c
    os.close(db_fd)
    os.unlink(db_path)


def login(client):
    return client.post('/login', data={'username':'admin','password':'admin123'}, follow_redirects=True)


def test_login_and_dashboard(client):
    rv = login(client)
    assert rv.status_code == 200
    assert b"Reliability Dashboard" in rv.data


def test_api_tasks_requires_auth(client):
    rv = client.get('/api/tasks')
    assert rv.status_code in (301, 302)


def test_export_csv(client):
    login(client)
    rv = client.get('/export/tasks.csv')
    assert rv.status_code == 200
    assert b"title,workflow,status" in rv.data
