from app.models import db, User, Workspace, WorkspaceMember, SessionToken


def signup(client, name, email, password="password123"):
    return client.post("/signup", data={"display_name": name, "email": email, "password": password}, follow_redirects=True)


def login(client, email, password="password123"):
    return client.post("/login", data={"email": email, "password": password}, follow_redirects=True)


def setup_workspace(app, client):
    signup(client, "Admin", "admin@test.com")
    client.post("/workspaces", data={"name": "Team"}, follow_redirects=True)
    with app.app_context():
        ws = Workspace.query.first()
    client.get(f"/workspace/{ws.id}/select")
    return ws.id


def test_auth_and_session_token_created(app, client):
    signup(client, "A", "a@test.com")
    with app.app_context():
        assert User.query.filter_by(email="a@test.com").first() is not None
        assert SessionToken.query.count() == 1


def test_workspace_and_task_flow(app, client):
    ws_id = setup_workspace(app, client)
    with app.app_context():
        dev = User(email="dev@test.com", display_name="Dev", avatar_color="#22c55e")
        dev.set_password("password123")
        db.session.add(dev)
        db.session.flush()
        db.session.add(WorkspaceMember(workspace_id=ws_id, user_id=dev.id, role="member"))
        db.session.commit()
        dev_id = dev.id

    r = client.post("/api/task", json={"title": "Ship board", "description": "Build drag and drop", "priority": "high", "status": "todo", "assignee_id": dev_id})
    assert r.status_code == 200
    board = client.get("/api/board").get_json()
    assert len(board["columns"]["todo"]) == 1

    tid = board["columns"]["todo"][0]["id"]
    moved = client.post(f"/api/task/{tid}/move", json={"status": "in_progress"})
    assert moved.status_code == 200

    detail = client.get(f"/api/task/{tid}").get_json()
    assert detail["task"]["status"] == "in_progress"


def test_invite_join_flow(app, client):
    ws_id = setup_workspace(app, client)
    client.post(f"/workspace/{ws_id}/invite", data={"email": "new@test.com"}, follow_redirects=True)

    with app.app_context():
        from app.models import Invite
        inv = Invite.query.first()
        token = inv.token

    c2 = app.test_client()
    r = c2.post(f"/invite/{token}", data={"display_name": "Newbie", "email": "new@test.com", "password": "password123"}, follow_redirects=True)
    assert r.status_code == 200
    with app.app_context():
        new_user = User.query.filter_by(email="new@test.com").first()
        assert WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=new_user.id).first() is not None


def test_members_page_access_and_admin_edit(app, client):
    ws_id = setup_workspace(app, client)
    res = client.get("/members")
    assert res.status_code == 200
    with app.app_context():
        admin = User.query.filter_by(email="admin@test.com").first()
        member = User(email="m@test.com", display_name="M", avatar_color="#ef4444")
        member.set_password("password123")
        db.session.add(member)
        db.session.flush()
        db.session.add(WorkspaceMember(workspace_id=ws_id, user_id=member.id, role="member"))
        db.session.commit()
        member_id = member.id
    up = client.post("/members", data={"target_user_id": member_id, "role": "admin"}, follow_redirects=True)
    assert up.status_code == 200
