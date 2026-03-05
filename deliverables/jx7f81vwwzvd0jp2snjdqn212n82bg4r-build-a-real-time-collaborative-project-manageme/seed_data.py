from datetime import date, timedelta, datetime
from app import create_app
from app.models import db, User, Workspace, WorkspaceMember, Task, Comment, Activity, Notification, SessionToken
import secrets

app=create_app()
with app.app_context():
    db.drop_all(); db.create_all()
    a=User(email='admin@team.local', avatar='A'); a.set_password('admin123')
    b=User(email='member@team.local', avatar='M'); b.set_password('member123')
    c=User(email='review@team.local', avatar='R'); c.set_password('review123')
    db.session.add_all([a,b,c]); db.session.flush()
    w=Workspace(name='Editorial Squad', invite_code='invite123abc', owner_id=a.id)
    db.session.add(w); db.session.flush()
    db.session.add_all([
        WorkspaceMember(workspace_id=w.id,user_id=a.id,role='admin'),
        WorkspaceMember(workspace_id=w.id,user_id=b.id,role='member'),
        WorkspaceMember(workspace_id=w.id,user_id=c.id,role='member')
    ])
    t=Task(workspace_id=w.id,title='Launch campaign page',description='Polish copy and publish',priority='high',due_date=date.today()-timedelta(days=1),status='review',assignee_id=b.id,created_by=a.id)
    db.session.add(t); db.session.flush()
    db.session.add(Comment(task_id=t.id,user_id=a.id,body='Please finalize hero text.'))
    db.session.add(Activity(task_id=t.id,user_id=a.id,field='create',old_value='',new_value=t.title))
    db.session.add(Notification(recipient_id=b.id,workspace_id=w.id,message='Assigned: Launch campaign page'))
    db.session.add(SessionToken(user_id=a.id, token=secrets.token_hex(16), expires_at=datetime.utcnow()+timedelta(days=30)))
    db.session.commit()
    print('Seeded users: admin@team.local/admin123 member@team.local/member123')
