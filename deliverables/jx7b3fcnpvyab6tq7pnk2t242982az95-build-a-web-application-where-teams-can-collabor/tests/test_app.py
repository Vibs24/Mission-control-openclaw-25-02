import os
import tempfile
import pytest
from app import create_app, db
from app.models import User, Workspace, WorkspaceMember


@pytest.fixture
def client():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}', 'SECRET_KEY': 't'})
    with app.app_context():
        db.create_all()
        u1 = User(email='a@example.com'); u1.set_password('pass')
        u2 = User(email='b@example.com'); u2.set_password('pass')
        db.session.add_all([u1, u2]); db.session.flush()
        ws = Workspace(name='WS', owner_id=u1.id)
        db.session.add(ws); db.session.flush()
        db.session.add_all([
            WorkspaceMember(workspace_id=ws.id, user_id=u1.id, role='Admin'),
            WorkspaceMember(workspace_id=ws.id, user_id=u2.id, role='Member')
        ])
        db.session.commit()
    with app.test_client() as c:
        yield c
    os.close(db_fd); os.unlink(db_path)


def login(client, email='a@example.com', password='pass'):
    return client.post('/login', data={'email': email, 'password': password}, follow_redirects=True)


def test_login_and_workspace_access(client):
    rv = login(client)
    assert b'Your Workspaces' in rv.data


def test_create_task_and_comment_notification(client):
    login(client)
    rv = client.post('/w/1/board', data={'title':'Task1','description':'d','priority':'High','assignee_id':'2'}, follow_redirects=True)
    assert b'Task1' in rv.data
    rv = client.post('/task/1/comment', data={'body':'Please start'}, follow_redirects=True)
    assert b'Please start' in rv.data


def test_drag_status_endpoint(client):
    login(client)
    client.post('/w/1/board', data={'title':'Task2','description':'d','priority':'Low'}, follow_redirects=True)
    rv = client.post('/task/1/status', data={'status':'Done'}, headers={'Accept':'application/json'})
    assert rv.status_code == 200
