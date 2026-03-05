from __future__ import annotations

from datetime import date, timedelta

from app.models import (
    Activity,
    Invite,
    Notification,
    SessionToken,
    Task,
    User,
    Workspace,
    WorkspaceMember,
    db,
)


def extract_cookie(response, name):
    for header in response.headers.getlist("Set-Cookie"):
        if header.startswith(f"{name}="):
            return header.split(";", 1)[0].split("=", 1)[1]
    return None


def signup(client, name="Admin User", email="admin@test.com", password="password123", follow_redirects=True):
    return client.post(
        "/signup",
        data={"display_name": name, "email": email, "password": password},
        follow_redirects=follow_redirects,
    )


def login(client, email="admin@test.com", password="password123", follow_redirects=True):
    return client.post(
        "/login",
        data={"email": email, "password": password},
        follow_redirects=follow_redirects,
    )


def create_workspace(client, name="Team Alpha"):
    client.post("/workspaces", data={"name": name}, follow_redirects=True)


def current_workspace_id(app):
    with app.app_context():
        ws = Workspace.query.order_by(Workspace.id.desc()).first()
        return ws.id


def add_member(app, ws_id, email="member@test.com", name="Member User", role="member"):
    with app.app_context():
        user = User(email=email, display_name=name, avatar_color="#22c55e")
        user.set_password("password123")
        db.session.add(user)
        db.session.flush()
        db.session.add(WorkspaceMember(workspace_id=ws_id, user_id=user.id, role=role))
        db.session.commit()
        return user.id


def seed_auth_workspace(app, client):
    signup(client)
    create_workspace(client)
    ws_id = current_workspace_id(app)
    client.get(f"/workspace/{ws_id}/select", follow_redirects=True)
    return ws_id


def test_signup_hashes_password_and_creates_session_token(app, client):
    response = signup(client, email="hash@test.com", follow_redirects=False)
    assert response.status_code == 302

    with app.app_context():
        user = User.query.filter_by(email="hash@test.com").first()
        assert user is not None
        assert user.password_hash != "password123"
        assert SessionToken.query.count() == 1


def test_login_invalid_credentials_rejected(client):
    response = login(client, email="missing@test.com", password="wrong", follow_redirects=False)
    assert response.status_code == 200
    assert b"Invalid credentials" in response.data


def test_session_token_restores_login_on_new_client(app, client):
    signup_response = signup(client, email="persist@test.com", follow_redirects=False)
    token = extract_cookie(signup_response, "session_token")
    assert token

    client2 = app.test_client()
    client2.set_cookie("session_token", token)
    response = client2.get("/workspaces")
    assert response.status_code == 200
    assert b"Your Workspaces" in response.data


def test_workspace_creation_and_admin_membership(app, client):
    signup(client)
    create_workspace(client, name="Delivery")

    with app.app_context():
        ws = Workspace.query.filter_by(name="Delivery").first()
        admin = User.query.filter_by(email="admin@test.com").first()
        membership = WorkspaceMember.query.filter_by(workspace_id=ws.id, user_id=admin.id).first()
        assert ws is not None
        assert membership is not None
        assert membership.role == "admin"


def test_invite_link_acceptance_creates_member(app, client):
    ws_id = seed_auth_workspace(app, client)
    client.post(f"/workspace/{ws_id}/invite", data={"email": "new@test.com"}, follow_redirects=True)

    with app.app_context():
        invite = Invite.query.first()
        token = invite.token

    invitee = app.test_client()
    response = invitee.post(
        f"/invite/{token}",
        data={"display_name": "New User", "email": "new@test.com", "password": "password123"},
        follow_redirects=True,
    )
    assert response.status_code == 200

    with app.app_context():
        joined = User.query.filter_by(email="new@test.com").first()
        membership = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=joined.id).first()
        invite = Invite.query.filter_by(token=token).first()
        assert membership is not None
        assert invite.accepted_at is not None


def test_admin_can_change_role_and_remove_member(app, client):
    ws_id = seed_auth_workspace(app, client)
    member_id = add_member(app, ws_id, email="role@test.com", name="Role User")

    change = client.post(
        "/members",
        data={"target_user_id": member_id, "role": "admin"},
        follow_redirects=True,
    )
    assert change.status_code == 200

    with app.app_context():
        updated = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=member_id).first()
        assert updated.role == "admin"

    removal = client.post(f"/members/remove/{member_id}", follow_redirects=True)
    assert removal.status_code == 200

    with app.app_context():
        assert WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=member_id).first() is None


def test_task_lifecycle_comments_and_activity_diff_logging(app, client):
    ws_id = seed_auth_workspace(app, client)
    assignee_id = add_member(app, ws_id, email="dev@test.com", name="Dev User")

    create = client.post(
        "/api/task",
        json={
            "title": "Ship board",
            "description": "Initial body",
            "status": "todo",
            "priority": "medium",
            "assignee_id": assignee_id,
            "due_date": (date.today() + timedelta(days=2)).isoformat(),
        },
    )
    assert create.status_code == 200

    board = client.get("/api/board").get_json()
    task_id = board["columns"]["todo"][0]["id"]

    moved = client.post(f"/api/task/{task_id}/move", json={"status": "in_progress"})
    assert moved.status_code == 200

    updated = client.post(
        f"/api/task/{task_id}/update",
        json={
            "title": "Ship board v2",
            "description": "Updated body",
            "priority": "high",
            "due_date": (date.today() + timedelta(days=5)).isoformat(),
            "assignee_id": assignee_id,
        },
    )
    assert updated.status_code == 200

    comment = client.post(f"/api/task/{task_id}/comment", json={"body": "LGTM"})
    assert comment.status_code == 200

    detail = client.get(f"/api/task/{task_id}").get_json()
    assert detail["task"]["status"] == "in_progress"
    assert len(detail["comments"]) == 1

    with app.app_context():
        events = Activity.query.filter_by(task_id=task_id).all()
        assert any(e.field_name == "status" and e.old_value == "todo" and e.new_value == "in_progress" for e in events)
        assert any(e.field_name == "description" and e.old_value == "Initial body" and e.new_value == "Updated body" for e in events)
        assert any(e.event_type == "comment" and e.new_value == "LGTM" for e in events)


def test_notifications_unread_and_mark_read(app, client):
    ws_id = seed_auth_workspace(app, client)
    member_id = add_member(app, ws_id, email="notify@test.com", name="Notify User")

    client.post(
        "/api/task",
        json={"title": "Ping", "description": "", "status": "todo", "priority": "low", "assignee_id": member_id},
    )

    member_client = app.test_client()
    login(member_client, email="notify@test.com")
    payload = member_client.get("/api/notifications").get_json()
    assert payload["unread_count"] >= 1

    first_id = payload["items"][0]["id"]
    member_client.post(f"/api/notifications/{first_id}/read", json={})
    payload_after = member_client.get("/api/notifications").get_json()
    assert payload_after["items"][0]["is_read"] is True


def test_export_endpoints_return_csv_and_pdf(app, client):
    ws_id = seed_auth_workspace(app, client)
    assignee_id = add_member(app, ws_id, email="export@test.com", name="Export User")

    client.post(
        "/api/task",
        json={"title": "Export me", "description": "desc", "status": "todo", "priority": "low", "assignee_id": assignee_id},
    )

    tasks_csv = client.get("/export/tasks.csv")
    assert tasks_csv.status_code == 200
    assert tasks_csv.mimetype == "text/csv"
    assert b"task_id,title,status" in tasks_csv.data

    workload_csv = client.get("/export/workload.csv")
    assert workload_csv.status_code == 200
    assert workload_csv.mimetype == "text/csv"
    assert b"user,role,todo" in workload_csv.data

    summary_pdf = client.get("/export/summary.pdf")
    assert summary_pdf.status_code == 200
    assert summary_pdf.mimetype == "application/pdf"
    assert summary_pdf.data.startswith(b"%PDF")


def test_smoke_board_page_renders_core_ui(app, client):
    seed_auth_workspace(app, client)
    response = client.get("/board")
    assert response.status_code == 200
    assert b"Create Task" in response.data
    assert b"Navigation" in response.data
