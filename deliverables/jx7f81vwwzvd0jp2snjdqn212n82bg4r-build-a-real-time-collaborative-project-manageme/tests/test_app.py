from app import create_app
from app.models import db, User, Workspace, WorkspaceMember, Task


def setup_client():
    app = create_app({'TESTING':True, 'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        a=User(email='a@x.com', avatar='A'); a.set_password('pass')
        b=User(email='b@x.com', avatar='B'); b.set_password('pass')
        db.session.add_all([a,b]); db.session.flush()
        w=Workspace(name='W', invite_code='abc123', owner_id=a.id); db.session.add(w); db.session.flush()
        db.session.add_all([WorkspaceMember(workspace_id=w.id,user_id=a.id,role='admin'),WorkspaceMember(workspace_id=w.id,user_id=b.id,role='member')])
        db.session.commit()
    return app.test_client(), app


def test_signup_and_workspace_create():
    c,_=setup_client()
    r=c.post('/signup', data={'email':'new@x.com','password':'z'}, follow_redirects=True)
    assert r.status_code==200


def test_create_and_move_task_api():
    c,app=setup_client()
    c.post('/login', data={'email':'a@x.com','password':'pass'}, follow_redirects=True)
    c.set_cookie('ws_id','1')
    r=c.post('/api/task', json={'title':'T','description':'D','priority':'high','due_date':'2026-03-08','assignee_id':2})
    assert r.json['ok'] is True
    tid=r.json['id']
    m=c.post(f'/api/task/{tid}/update', json={'status':'done'})
    assert m.json['ok'] is True
    with app.app_context():
        assert db.session.get(Task, tid).status=='done'
