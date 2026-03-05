import os, tempfile
import pytest
from app import create_app, db
from app.models import User, Workspace, WorkspaceMember

@pytest.fixture
def client():
    fd, p = tempfile.mkstemp()
    app = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':f'sqlite:///{p}','SECRET_KEY':'t'})
    with app.app_context():
        db.create_all()
        u1=User(email='u1@example.com'); u1.set_password('pass')
        u2=User(email='u2@example.com'); u2.set_password('pass')
        db.session.add_all([u1,u2]); db.session.flush()
        ws=Workspace(name='W', owner_id=u1.id); db.session.add(ws); db.session.flush()
        db.session.add_all([WorkspaceMember(workspace_id=ws.id,user_id=u1.id,role='admin',online=True),WorkspaceMember(workspace_id=ws.id,user_id=u2.id,role='member',online=True)])
        db.session.commit()
    with app.test_client() as c: yield c
    os.close(fd); os.unlink(p)

def login(c,email='u1@example.com'):
    return c.post('/login',data={'email':email,'password':'pass'},follow_redirects=True)

def test_auth_and_workspace(client):
    rv = login(client)
    assert b'Your Workspaces' in rv.data

def test_task_create_move_comment(client):
    login(client)
    rv=client.post('/w/1/tasks',data={'title':'T1','description':'d','priority':'High','status':'To Do','assignee_id':'2'})
    assert rv.status_code==200
    rv=client.post('/task/1/update',data={'title':'T1','description':'d','priority':'High','due_date':'','status':'Review','assignee_id':'2'})
    assert rv.status_code==200
    rv=client.post('/task/1/comment',data={'body':'Looks good'})
    assert rv.status_code==200

def test_search_notifications_json(client):
    login(client)
    client.post('/w/1/tasks',data={'title':'Needle','description':'haystack','priority':'Low','status':'To Do'})
    rv=client.get('/w/1/tasks?q=Needle')
    assert b'Needle' in rv.data
    rv=client.get('/notifications')
    assert rv.status_code==200
