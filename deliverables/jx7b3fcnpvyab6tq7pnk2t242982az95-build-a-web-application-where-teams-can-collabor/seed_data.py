from datetime import date
from app import create_app, db
from app.models import User, Workspace, WorkspaceMember, Task, TaskHistory

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    u1 = User(email='owner@example.com')
    u1.set_password('owner123')
    u2 = User(email='member@example.com')
    u2.set_password('member123')
    db.session.add_all([u1, u2])
    db.session.flush()

    ws = Workspace(name='Product Team', owner_id=u1.id)
    db.session.add(ws)
    db.session.flush()

    db.session.add_all([
        WorkspaceMember(workspace_id=ws.id, user_id=u1.id, role='Admin'),
        WorkspaceMember(workspace_id=ws.id, user_id=u2.id, role='Member'),
    ])

    t = Task(workspace_id=ws.id, title='Release Notes', description='Prepare notes', due_date=date.today(), priority='High', status='Todo', assignee_id=u2.id, created_by=u1.id)
    db.session.add(t)
    db.session.flush()
    db.session.add(TaskHistory(task_id=t.id, actor_id=u1.id, action='create', detail='Seed task created'))

    db.session.commit()
    print('Seed complete: owner/member users + workspace + task')
