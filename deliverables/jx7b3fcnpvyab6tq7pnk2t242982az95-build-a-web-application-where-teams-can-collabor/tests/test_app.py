from app.main import Invite, Membership, Notification, Task, User, Workspace, create_app, db


def make_app():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "WTF_CSRF_ENABLED": False,
        "SECRET_KEY": "test",
    })
    return app


def signup(client, name, email, password="password123"):
    return client.post("/signup", data={"name": name, "email": email, "password": password}, follow_redirects=True)


def login(client, email, password="password123"):
    return client.post("/login", data={"email": email, "password": password}, follow_redirects=True)


def test_signup_login_workspace_task_flow():
    app = make_app()
    with app.app_context():
        db.drop_all()
        db.create_all()

    client = app.test_client()

    rv = signup(client, "Alice", "alice@test.com")
    assert rv.status_code == 200

    rv = client.post("/workspaces/create", data={"name": "Alpha"}, follow_redirects=True)
    assert b"Alpha" in rv.data

    with app.app_context():
        ws = Workspace.query.filter_by(name="Alpha").first()
        user = User.query.filter_by(email="alice@test.com").first()
        assert Membership.query.filter_by(workspace_id=ws.id, user_id=user.id, role="admin").first()

    rv = client.post(f"/workspaces/{ws.id}/tasks/create", data={
        "title": "First task",
        "description": "desc",
        "priority": "high",
        "assignee_id": "",
        "due_date": "",
    }, follow_redirects=True)
    assert b"First task" in rv.data


def test_invite_accept_and_notifications_and_move():
    app = make_app()
    with app.app_context():
        db.drop_all()
        db.create_all()

    client1 = app.test_client()
    signup(client1, "Admin", "admin@test.com")
    client1.post("/workspaces/create", data={"name": "Beta"}, follow_redirects=True)

    with app.app_context():
        ws = Workspace.query.filter_by(name="Beta").first()

    client1.post(f"/workspaces/{ws.id}/invite", data={"email": "member@test.com"}, follow_redirects=True)

    with app.app_context():
        inv = Invite.query.filter_by(email="member@test.com", workspace_id=ws.id).first()
        assert inv is not None

    client2 = app.test_client()
    signup(client2, "Member", "member@test.com")
    rv = client2.get(f"/invites/{inv.token}/accept", follow_redirects=True)
    assert rv.status_code == 200
    assert b"Beta" in rv.data

    with app.app_context():
        member = User.query.filter_by(email="member@test.com").first()

    client1.post(f"/workspaces/{ws.id}/tasks/create", data={
        "title": "Assign me",
        "description": "assigned",
        "priority": "medium",
        "assignee_id": str(member.id),
        "due_date": "",
    }, follow_redirects=True)

    with app.app_context():
        task = Task.query.filter_by(title="Assign me").first()
        assert Notification.query.filter_by(user_id=member.id, task_id=task.id).count() >= 1

    rv = client2.post(f"/api/tasks/{task.id}/move", json={"status": "in_progress"})
    assert rv.status_code == 200

    with app.app_context():
        task = Task.query.get(task.id)
        assert task.status == "in_progress"
