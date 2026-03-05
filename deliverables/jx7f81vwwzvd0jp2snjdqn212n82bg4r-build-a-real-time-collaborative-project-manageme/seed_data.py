from datetime import date, timedelta
from app import create_app
from app.models import db, User, Workspace, WorkspaceMember, Task, Activity

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(email="admin@example.com", display_name="Admin", avatar_color="#3b82f6")
    admin.set_password("password123")
    dev = User(email="dev@example.com", display_name="Dev", avatar_color="#22c55e")
    dev.set_password("password123")
    db.session.add_all([admin, dev])
    db.session.flush()

    ws = Workspace(name="Launch Squad", owner_id=admin.id, invite_slug="launch-squad")
    db.session.add(ws)
    db.session.flush()

    db.session.add_all([
        WorkspaceMember(workspace_id=ws.id, user_id=admin.id, role="admin"),
        WorkspaceMember(workspace_id=ws.id, user_id=dev.id, role="member"),
    ])

    tasks = [
        Task(workspace_id=ws.id, title="Roadmap draft", description="Outline quarter plan", status="todo", priority="high", assignee_id=admin.id, created_by=admin.id, due_date=date.today() + timedelta(days=2)),
        Task(workspace_id=ws.id, title="Setup CI", description="GitHub Actions and linting", status="in_progress", priority="medium", assignee_id=dev.id, created_by=admin.id, due_date=date.today() + timedelta(days=4)),
        Task(workspace_id=ws.id, title="Design review", description="Review dark theme polish", status="review", priority="low", assignee_id=admin.id, created_by=dev.id),
    ]
    db.session.add_all(tasks)
    db.session.flush()

    for t in tasks:
        db.session.add(Activity(task_id=t.id, actor_id=admin.id, event_type="seed", detail="Seeded task"))

    db.session.commit()
    print("Seed data created. Login: admin@example.com / password123")
