from datetime import date
from app import create_app, db
from app.models import User, Workspace, WorkspaceMember, Task, Activity

app = create_app()

with app.app_context():
    db.drop_all(); db.create_all()
    a = User(email='admin@example.com', avatar='🧑‍💼'); a.set_password('admin123')
    b = User(email='member@example.com', avatar='🧑‍🔧'); b.set_password('member123')
    db.session.add_all([a,b]); db.session.flush()
    ws = Workspace(name='Editorial Squad', owner_id=a.id)
    db.session.add(ws); db.session.flush()
    db.session.add_all([
        WorkspaceMember(workspace_id=ws.id, user_id=a.id, role='admin', online=True),
        WorkspaceMember(workspace_id=ws.id, user_id=b.id, role='member', online=True),
    ])
    t = Task(workspace_id=ws.id, title='Launch checklist', description='Draft final QA list', due_date=date.today(), priority='High', status='To Do', assignee_id=b.id, created_by=a.id)
    db.session.add(t); db.session.flush()
    db.session.add(Activity(task_id=t.id, actor_id=a.id, field_name='task', detail='Seed task created'))
    db.session.commit()
    print('Seeded admin/member + workspace + task')
