from app import create_app
from app.models import db, User, Workspace, WorkspaceMember

def setup_client():
    app=create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        u=User(email='a@x.com'); u.set_password('pass')
        v=User(email='b@x.com'); v.set_password('pass')
        db.session.add_all([u,v]); db.session.flush()
        ws=Workspace(name='WS', owner_id=u.id); db.session.add(ws); db.session.flush()
        db.session.add_all([WorkspaceMember(workspace_id=ws.id,user_id=u.id,role='admin'),WorkspaceMember(workspace_id=ws.id,user_id=v.id,role='member')])
        db.session.commit()
    return app.test_client(), app

def test_signup_login_flow():
    c, _ = setup_client()
    r=c.post('/signup', data={'email':'new@x.com','password':'x'}, follow_redirects=True)
    assert r.status_code==200

def test_create_task_and_comment_notification():
    c, app = setup_client()
    c.post('/login', data={'email':'a@x.com','password':'pass'}, follow_redirects=True)
    c.get('/workspace/1/set')
    c.post('/board', data={'title':'T1','description':'D','due_date':'2026-03-05','priority':'high','assignee_id':'2'}, follow_redirects=True)
    r=c.get('/board')
    assert b'T1' in r.data
