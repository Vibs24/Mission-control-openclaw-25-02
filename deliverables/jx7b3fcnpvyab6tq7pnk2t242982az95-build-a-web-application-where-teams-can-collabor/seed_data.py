from datetime import date
from app import create_app
from app.models import db, User, Workspace, WorkspaceMember, Task, Comment, TaskHistory, Notification
app=create_app()
with app.app_context():
    db.drop_all(); db.create_all()
    a=User(email='admin@team.local'); a.set_password('admin123')
    b=User(email='member@team.local'); b.set_password('member123')
    db.session.add_all([a,b]); db.session.flush()
    ws=Workspace(name='Engineering Daily', owner_id=a.id); db.session.add(ws); db.session.flush()
    db.session.add_all([WorkspaceMember(workspace_id=ws.id,user_id=a.id,role='admin'),WorkspaceMember(workspace_id=ws.id,user_id=b.id,role='member')])
    t=Task(workspace_id=ws.id,title='Ship sprint board',description='Finalize board UX',due_date=date.today(),priority='high',assignee_id=b.id,created_by=a.id)
    db.session.add(t); db.session.flush(); db.session.add(Comment(task_id=t.id,user_id=a.id,body='Please update by EOD'))
    db.session.add(TaskHistory(task_id=t.id,action='seed',detail='initial task seeded')); db.session.add(Notification(user_id=b.id,message='You were assigned task: Ship sprint board'))
    db.session.commit(); print('Seeded. Login: admin@team.local/admin123')
