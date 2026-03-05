from __future__ import annotations

import csv
import io
import secrets
from collections import defaultdict
from datetime import date, datetime, timedelta

from flask import (
    abort,
    flash,
    jsonify,
    make_response,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import func, or_

from .models import (
    Activity,
    Comment,
    Invite,
    Notification,
    SessionToken,
    Task,
    User,
    Workspace,
    WorkspaceMember,
    db,
)

STATUSES = ["todo", "in_progress", "review", "done"]
STATUS_LABELS = {"todo": "To Do", "in_progress": "In Progress", "review": "Review", "done": "Done"}
PRIORITIES = ["low", "medium", "high", "urgent"]
PRIORITY_COLORS = {"low": "#22c55e", "medium": "#eab308", "high": "#f97316", "urgent": "#ef4444"}
AVATAR_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#06b6d4", "#a855f7"]
PRESENCE_WINDOW_MIN = 10


def _display_value(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _session_cookie_config():
    return {
        "max_age": 60 * 60 * 24 * 30,
        "httponly": True,
        "samesite": "Lax",
        "secure": False,
    }


def _issue_session_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db.session.add(
        SessionToken(
            user_id=user_id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(days=30),
            last_seen_at=datetime.utcnow(),
        )
    )
    db.session.commit()
    return token


def _clear_session_token(token: str | None):
    if not token:
        return
    SessionToken.query.filter_by(token=token).delete()
    db.session.commit()


def _workspace_id_from_request() -> int | None:
    val = request.args.get("ws_id") or session.get("workspace_id")
    if not val:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _workspace_member(ws_id: int, user_id: int):
    return WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=user_id).first()


def _ensure_workspace_member(ws_id: int):
    if not current_user.is_authenticated:
        abort(401)
    member = _workspace_member(ws_id, current_user.id)
    if not member:
        abort(403)
    return member


def _current_workspace_or_redirect():
    ws_id = _workspace_id_from_request()
    if not ws_id:
        return None
    member = _workspace_member(ws_id, current_user.id)
    if not member:
        return None
    return db.session.get(Workspace, ws_id)


def _workspace_context(active_nav: str, show_board_search: bool = False):
    ws = _current_workspace_or_redirect()
    memberships = (
        Workspace.query.join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == current_user.id)
        .order_by(Workspace.name.asc())
        .all()
    )
    unread_count = Notification.query.filter_by(recipient_id=current_user.id, is_read=False).count()
    online_users = []
    if ws:
        recent_cutoff = datetime.utcnow() - timedelta(minutes=PRESENCE_WINDOW_MIN)
        recent_user_ids = (
            db.session.query(SessionToken.user_id)
            .join(WorkspaceMember, WorkspaceMember.user_id == SessionToken.user_id)
            .filter(
                WorkspaceMember.workspace_id == ws.id,
                SessionToken.expires_at > datetime.utcnow(),
                SessionToken.last_seen_at >= recent_cutoff,
            )
            .distinct()
            .all()
        )
        online_users = User.query.filter(User.id.in_([uid for (uid,) in recent_user_ids])).all() if recent_user_ids else []
    return {
        "active_nav": active_nav,
        "show_board_search": show_board_search,
        "workspace": ws,
        "workspace_list": memberships,
        "online_users": online_users,
        "unread_count": unread_count,
    }


def _log_activity(
    *,
    workspace_id: int,
    task_id: int,
    event_type: str,
    field_name: str,
    old_value=None,
    new_value=None,
    actor_id: int | None = None,
):
    db.session.add(
        Activity(
            workspace_id=workspace_id,
            task_id=task_id,
            actor_id=actor_id or current_user.id,
            event_type=event_type,
            field_name=field_name,
            old_value=_display_value(old_value),
            new_value=_display_value(new_value),
        )
    )


def _notify(recipient_id: int | None, workspace_id: int, task_id: int | None, body: str):
    if not recipient_id or recipient_id == current_user.id:
        return
    db.session.add(
        Notification(
            recipient_id=recipient_id,
            actor_id=current_user.id,
            workspace_id=workspace_id,
            task_id=task_id,
            body=body[:255],
        )
    )


def _initials(name: str) -> str:
    pieces = [part for part in name.split() if part]
    if not pieces:
        return "?"
    if len(pieces) == 1:
        return pieces[0][0].upper()
    return f"{pieces[0][0]}{pieces[1][0]}".upper()


def _simple_pdf(lines: list[str]) -> bytes:
    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    stream_lines = ["BT", "/F1 12 Tf", "1 0 0 1 48 780 Tm"]
    for idx, line in enumerate(lines):
        if idx > 0:
            stream_lines.append("0 -16 Td")
        stream_lines.append(f"({esc(line)}) Tj")
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1", "replace")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream\nendobj\n",
    ]

    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj
    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode("ascii")
    pdf += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("ascii")
    pdf += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
    return pdf


def register_routes(app):
    @app.before_request
    def _restore_login_and_presence():
        if request.endpoint == "static":
            return
        now = datetime.utcnow()
        token = request.cookies.get("session_token")
        changed = False
        if current_user.is_authenticated:
            current_user.last_active_at = now
            changed = True
            if token:
                st = SessionToken.query.filter_by(token=token, user_id=current_user.id).first()
                if st and st.expires_at > now:
                    st.last_seen_at = now
                    changed = True
        elif token:
            st = SessionToken.query.filter_by(token=token).first()
            if st and st.expires_at > now:
                user = db.session.get(User, st.user_id)
                if user:
                    login_user(user, remember=True)
                    user.last_active_at = now
                    st.last_seen_at = now
                    changed = True
            else:
                if st:
                    db.session.delete(st)
                    changed = True
        if changed:
            db.session.commit()

    @app.get("/")
    def root():
        if current_user.is_authenticated:
            ws = _current_workspace_or_redirect()
            if ws:
                return redirect(url_for("board"))
            return redirect(url_for("workspaces"))
        return redirect(url_for("login"))

    @app.route("/signup", methods=["GET", "POST"])
    def signup():
        if current_user.is_authenticated:
            return redirect(url_for("workspaces"))
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            display_name = request.form.get("display_name", "").strip()
            if not email or "@" not in email:
                flash("Valid email is required.", "danger")
                return render_template("signup.html")
            if len(password) < 8:
                flash("Password must be at least 8 characters.", "danger")
                return render_template("signup.html")
            if User.query.filter_by(email=email).first():
                flash("Email already registered.", "danger")
                return render_template("signup.html")

            color = AVATAR_COLORS[abs(hash(email)) % len(AVATAR_COLORS)]
            user = User(email=email, display_name=display_name or email.split("@")[0], avatar_color=color)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

            login_user(user, remember=True)
            token = _issue_session_token(user.id)
            response = make_response(redirect(url_for("workspaces")))
            response.set_cookie("session_token", token, **_session_cookie_config())
            return response
        return render_template("signup.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if current_user.is_authenticated:
            return redirect(url_for("workspaces"))
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            user = User.query.filter_by(email=email).first()
            if user and user.check_password(password):
                login_user(user, remember=True)
                token = _issue_session_token(user.id)
                response = make_response(redirect(url_for("workspaces")))
                response.set_cookie("session_token", token, **_session_cookie_config())
                return response
            flash("Invalid credentials.", "danger")
        return render_template("login.html")

    @app.get("/logout")
    @login_required
    def logout():
        token = request.cookies.get("session_token")
        _clear_session_token(token)
        session.pop("workspace_id", None)
        logout_user()
        response = make_response(redirect(url_for("login")))
        response.delete_cookie("session_token")
        return response

    @app.route("/workspaces", methods=["GET", "POST"])
    @login_required
    def workspaces():
        if request.method == "POST":
            name = request.form.get("name", "").strip()
            if not name:
                flash("Workspace name is required.", "danger")
                return redirect(url_for("workspaces"))
            ws = Workspace(name=name, owner_id=current_user.id, invite_slug=secrets.token_urlsafe(8))
            db.session.add(ws)
            db.session.flush()
            db.session.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role="admin"))
            db.session.commit()
            session["workspace_id"] = ws.id
            return redirect(url_for("board"))

        rows = (
            Workspace.query.join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .filter(WorkspaceMember.user_id == current_user.id)
            .order_by(Workspace.name.asc())
            .all()
        )
        return render_template("workspaces.html", rows=rows, **_workspace_context(active_nav="workspaces"))

    @app.get("/workspace/<int:ws_id>/select")
    @login_required
    def set_workspace(ws_id):
        _ensure_workspace_member(ws_id)
        session["workspace_id"] = ws_id
        return redirect(url_for("board"))

    @app.post("/workspace/<int:ws_id>/invite")
    @login_required
    def create_invite(ws_id):
        member = _ensure_workspace_member(ws_id)
        if member.role != "admin":
            abort(403)
        email = request.form.get("email", "").strip().lower()
        if not email:
            flash("Invite email is required.", "danger")
            return redirect(url_for("members"))
        token = secrets.token_urlsafe(24)
        invite = Invite(
            workspace_id=ws_id,
            email=email,
            token=token,
            invited_by=current_user.id,
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(invite)
        db.session.commit()
        link = url_for("accept_invite", token=token, _external=True)
        flash(f"Invite link for {email}: {link}", "info")
        return redirect(url_for("members"))

    @app.route("/invites/<token>/accept", methods=["GET", "POST"])
    @app.route("/invite/<token>", methods=["GET", "POST"])
    def accept_invite(token):
        invite = Invite.query.filter_by(token=token).first_or_404()
        if invite.expires_at < datetime.utcnow():
            abort(410)

        if request.method == "POST":
            email = request.form.get("email", "").strip().lower() or invite.email
            display_name = request.form.get("display_name", "").strip() or email.split("@")[0]
            password = request.form.get("password", "")

            user = User.query.filter_by(email=email).first()
            if not user:
                if len(password) < 8:
                    flash("Password must be at least 8 characters.", "danger")
                    return render_template("invite_accept.html", invite=invite)
                user = User(email=email, display_name=display_name, avatar_color=AVATAR_COLORS[abs(hash(email)) % len(AVATAR_COLORS)])
                user.set_password(password)
                db.session.add(user)
                db.session.flush()

            existing = WorkspaceMember.query.filter_by(workspace_id=invite.workspace_id, user_id=user.id).first()
            if not existing:
                db.session.add(WorkspaceMember(workspace_id=invite.workspace_id, user_id=user.id, role="member"))
            invite.accepted_at = datetime.utcnow()
            db.session.commit()

            login_user(user, remember=True)
            token_value = _issue_session_token(user.id)
            session["workspace_id"] = invite.workspace_id
            response = make_response(redirect(url_for("board")))
            response.set_cookie("session_token", token_value, **_session_cookie_config())
            return response

        return render_template("invite_accept.html", invite=invite)

    @app.route("/members", methods=["GET", "POST"])
    @login_required
    def members():
        ws = _current_workspace_or_redirect()
        if not ws:
            return redirect(url_for("workspaces"))
        member = _ensure_workspace_member(ws.id)
        editable = member.role == "admin"

        if request.method == "POST":
            if not editable:
                abort(403)
            target_user_id = int(request.form.get("target_user_id", "0"))
            new_role = request.form.get("role", "member")
            if new_role not in ("admin", "member"):
                abort(400)
            target = WorkspaceMember.query.filter_by(workspace_id=ws.id, user_id=target_user_id).first_or_404()
            old_role = target.role
            target.role = new_role
            db.session.commit()
            flash(f"Role updated: {old_role} -> {new_role}", "info")
            return redirect(url_for("members"))

        member_rows = WorkspaceMember.query.filter_by(workspace_id=ws.id).order_by(WorkspaceMember.joined_at.asc()).all()
        users = {user.id: user for user in User.query.filter(User.id.in_([m.user_id for m in member_rows])).all()}

        workload = {}
        for row in member_rows:
            counts = {
                status: Task.query.filter_by(workspace_id=ws.id, assignee_id=row.user_id, status=status).count()
                for status in STATUSES
            }
            workload[row.user_id] = counts

        pending_invites = Invite.query.filter_by(workspace_id=ws.id, accepted_at=None).order_by(Invite.created_at.desc()).all()
        return render_template(
            "members.html",
            rows=member_rows,
            users=users,
            workload=workload,
            editable=editable,
            pending_invites=pending_invites,
            **_workspace_context(active_nav="members"),
        )

    @app.post("/members/remove/<int:user_id>")
    @login_required
    def members_remove(user_id):
        ws = _current_workspace_or_redirect()
        if not ws:
            return redirect(url_for("workspaces"))
        member = _ensure_workspace_member(ws.id)
        if member.role != "admin" or user_id == current_user.id:
            abort(403)
        WorkspaceMember.query.filter_by(workspace_id=ws.id, user_id=user_id).delete()
        db.session.commit()
        flash("Member removed.", "info")
        return redirect(url_for("members"))

    @app.get("/activity")
    @login_required
    def activity():
        ws = _current_workspace_or_redirect()
        if not ws:
            return redirect(url_for("workspaces"))
        _ensure_workspace_member(ws.id)
        history = Activity.query.filter_by(workspace_id=ws.id).order_by(Activity.created_at.desc()).limit(250).all()
        user_ids = {a.actor_id for a in history if a.actor_id}
        task_ids = {a.task_id for a in history if a.task_id}
        users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
        tasks = {t.id: t for t in Task.query.filter(Task.id.in_(task_ids)).all()} if task_ids else {}
        return render_template("activity.html", history=history, users=users, tasks=tasks, **_workspace_context(active_nav="activity"))

    @app.get("/board")
    @login_required
    def board():
        ws = _current_workspace_or_redirect()
        if not ws:
            return redirect(url_for("workspaces"))
        _ensure_workspace_member(ws.id)
        members = (
            User.query.join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .filter(WorkspaceMember.workspace_id == ws.id)
            .order_by(User.display_name.asc())
            .all()
        )
        return render_template("board.html", members=members, **_workspace_context(active_nav="board", show_board_search=True))

    @app.get("/api/board")
    @login_required
    def api_board():
        ws = _current_workspace_or_redirect()
        if not ws:
            abort(403)
        _ensure_workspace_member(ws.id)

        query_text = request.args.get("q", "").strip()
        query = Task.query.filter_by(workspace_id=ws.id)
        if query_text:
            like = f"%{query_text}%"
            query = query.filter(or_(Task.title.ilike(like), Task.description.ilike(like)))
        tasks = query.order_by(Task.updated_at.desc()).all()
        task_ids = [task.id for task in tasks]

        comments_by_task = defaultdict(int)
        if task_ids:
            counts = (
                db.session.query(Comment.task_id, func.count(Comment.id))
                .filter(Comment.task_id.in_(task_ids))
                .group_by(Comment.task_id)
                .all()
            )
            comments_by_task = defaultdict(int, {task_id: count for task_id, count in counts})

        assignee_ids = [task.assignee_id for task in tasks if task.assignee_id]
        assignees = {u.id: u for u in User.query.filter(User.id.in_(assignee_ids)).all()} if assignee_ids else {}
        now = datetime.utcnow().date()
        columns = {status: [] for status in STATUSES}
        for task in tasks:
            assignee = assignees.get(task.assignee_id)
            columns[task.status].append(
                {
                    "id": task.id,
                    "title": task.title,
                    "priority": task.priority,
                    "priority_color": PRIORITY_COLORS.get(task.priority, "#9ca3af"),
                    "due_date": task.due_date.isoformat() if task.due_date else "",
                    "is_overdue": bool(task.due_date and task.due_date < now and task.status != "done"),
                    "comment_count": comments_by_task[task.id],
                    "assignee": (
                        {
                            "id": assignee.id,
                            "name": assignee.display_name,
                            "initials": assignee.initials,
                            "color": assignee.avatar_color,
                        }
                        if assignee
                        else None
                    ),
                }
            )
        return jsonify({"columns": columns, "statuses": STATUSES})

    @app.post("/api/task")
    @login_required
    def api_create_task():
        ws = _current_workspace_or_redirect()
        if not ws:
            abort(403)
        _ensure_workspace_member(ws.id)
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"ok": False, "error": "title_required"}), 400

        status = data.get("status", "todo")
        priority = data.get("priority", "medium")
        if status not in STATUSES or priority not in PRIORITIES:
            return jsonify({"ok": False, "error": "invalid_choice"}), 400

        assignee_id = int(data["assignee_id"]) if data.get("assignee_id") else None
        if assignee_id:
            _ensure_workspace_member(ws.id)
            if not WorkspaceMember.query.filter_by(workspace_id=ws.id, user_id=assignee_id).first():
                return jsonify({"ok": False, "error": "invalid_assignee"}), 400

        due_date = None
        if data.get("due_date"):
            try:
                due_date = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"ok": False, "error": "invalid_due_date"}), 400

        task = Task(
            workspace_id=ws.id,
            title=title,
            description=data.get("description", "").strip(),
            status=status,
            priority=priority,
            due_date=due_date,
            assignee_id=assignee_id,
            created_by=current_user.id,
        )
        db.session.add(task)
        db.session.flush()

        _log_activity(workspace_id=ws.id, task_id=task.id, event_type="create", field_name="title", old_value="", new_value=task.title)
        _log_activity(workspace_id=ws.id, task_id=task.id, event_type="create", field_name="status", old_value="", new_value=task.status)
        if assignee_id:
            _notify(assignee_id, ws.id, task.id, f"You were assigned task '{task.title}'.")
        db.session.commit()
        return jsonify({"ok": True, "id": task.id})

    @app.get("/api/task/<int:task_id>")
    @login_required
    def api_task_detail(task_id):
        task = db.session.get(Task, task_id)
        if not task:
            abort(404)
        _ensure_workspace_member(task.workspace_id)

        comments = Comment.query.filter_by(task_id=task.id).order_by(Comment.created_at.asc()).all()
        activities = Activity.query.filter_by(task_id=task.id).order_by(Activity.created_at.asc()).all()
        member_users = (
            User.query.join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .filter(WorkspaceMember.workspace_id == task.workspace_id)
            .order_by(User.display_name.asc())
            .all()
        )
        users = {u.id: u for u in member_users}
        users.update({u.id: u for u in User.query.filter(User.id.in_({c.user_id for c in comments if c.user_id} | {a.actor_id for a in activities if a.actor_id})).all()})
        return jsonify(
            {
                "task": {
                    "id": task.id,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else "",
                    "assignee_id": task.assignee_id,
                },
                "members": [
                    {"id": member.id, "name": member.display_name, "initials": member.initials, "color": member.avatar_color}
                    for member in member_users
                ],
                "comments": [
                    {
                        "id": comment.id,
                        "body": comment.body,
                        "parent_id": comment.parent_id,
                        "created_at": comment.created_at.isoformat(),
                        "author": users[comment.user_id].display_name if comment.user_id in users else "Unknown",
                        "initials": users[comment.user_id].initials if comment.user_id in users else "?",
                        "color": users[comment.user_id].avatar_color if comment.user_id in users else "#64748b",
                    }
                    for comment in comments
                ],
                "activity": [
                    {
                        "id": activity.id,
                        "event_type": activity.event_type,
                        "field_name": activity.field_name,
                        "old_value": activity.old_value or "",
                        "new_value": activity.new_value or "",
                        "created_at": activity.created_at.isoformat(),
                        "actor": users[activity.actor_id].display_name if activity.actor_id in users else "System",
                    }
                    for activity in activities
                ],
            }
        )

    @app.post("/api/task/<int:task_id>/move")
    @login_required
    def api_move_task(task_id):
        task = db.session.get(Task, task_id)
        if not task:
            abort(404)
        _ensure_workspace_member(task.workspace_id)
        data = request.get_json(silent=True) or {}
        new_status = data.get("status")
        if new_status not in STATUSES:
            return jsonify({"ok": False, "error": "invalid_status"}), 400

        old_status = task.status
        if old_status != new_status:
            task.status = new_status
            _log_activity(
                workspace_id=task.workspace_id,
                task_id=task.id,
                event_type="status",
                field_name="status",
                old_value=old_status,
                new_value=new_status,
            )
            _notify(task.assignee_id, task.workspace_id, task.id, f"Task '{task.title}' moved to {STATUS_LABELS[new_status]}.")
            db.session.commit()
        return jsonify({"ok": True, "status": new_status})

    @app.post("/api/task/<int:task_id>/update")
    @login_required
    def api_update_task(task_id):
        task = db.session.get(Task, task_id)
        if not task:
            abort(404)
        _ensure_workspace_member(task.workspace_id)
        data = request.get_json(silent=True) or {}
        changed = False

        new_title = (data.get("title") or task.title).strip()
        if new_title and new_title != task.title:
            _log_activity(
                workspace_id=task.workspace_id,
                task_id=task.id,
                event_type="edit",
                field_name="title",
                old_value=task.title,
                new_value=new_title,
            )
            task.title = new_title
            changed = True

        new_description = data.get("description", task.description)
        if new_description != task.description:
            _log_activity(
                workspace_id=task.workspace_id,
                task_id=task.id,
                event_type="edit",
                field_name="description",
                old_value=task.description,
                new_value=new_description,
            )
            task.description = new_description
            changed = True

        new_priority = data.get("priority", task.priority)
        if new_priority not in PRIORITIES:
            return jsonify({"ok": False, "error": "invalid_priority"}), 400
        if new_priority != task.priority:
            _log_activity(
                workspace_id=task.workspace_id,
                task_id=task.id,
                event_type="edit",
                field_name="priority",
                old_value=task.priority,
                new_value=new_priority,
            )
            task.priority = new_priority
            changed = True

        raw_due = data.get("due_date")
        new_due = task.due_date
        if raw_due is not None:
            if raw_due == "":
                new_due = None
            else:
                try:
                    new_due = datetime.strptime(raw_due, "%Y-%m-%d").date()
                except ValueError:
                    return jsonify({"ok": False, "error": "invalid_due_date"}), 400
        if new_due != task.due_date:
            _log_activity(
                workspace_id=task.workspace_id,
                task_id=task.id,
                event_type="edit",
                field_name="due_date",
                old_value=task.due_date,
                new_value=new_due,
            )
            task.due_date = new_due
            changed = True

        if "assignee_id" in data:
            new_assignee = int(data["assignee_id"]) if data.get("assignee_id") else None
            if new_assignee and not WorkspaceMember.query.filter_by(workspace_id=task.workspace_id, user_id=new_assignee).first():
                return jsonify({"ok": False, "error": "invalid_assignee"}), 400
            if new_assignee != task.assignee_id:
                _log_activity(
                    workspace_id=task.workspace_id,
                    task_id=task.id,
                    event_type="assignment",
                    field_name="assignee_id",
                    old_value=task.assignee_id,
                    new_value=new_assignee,
                )
                task.assignee_id = new_assignee
                changed = True
                _notify(new_assignee, task.workspace_id, task.id, f"You were assigned task '{task.title}'.")

        if changed:
            db.session.commit()
        return jsonify({"ok": True})

    @app.post("/api/task/<int:task_id>/comment")
    @login_required
    def api_add_comment(task_id):
        task = db.session.get(Task, task_id)
        if not task:
            abort(404)
        _ensure_workspace_member(task.workspace_id)
        data = request.get_json(silent=True) or {}
        body = (data.get("body") or "").strip()
        if not body:
            return jsonify({"ok": False, "error": "empty_comment"}), 400

        parent_id = data.get("parent_id")
        parent_comment = None
        if parent_id:
            parent_comment = db.session.get(Comment, int(parent_id))
            if not parent_comment or parent_comment.task_id != task.id:
                return jsonify({"ok": False, "error": "invalid_parent"}), 400

        comment = Comment(task_id=task.id, user_id=current_user.id, body=body, parent_id=parent_comment.id if parent_comment else None)
        db.session.add(comment)
        db.session.flush()
        _log_activity(
            workspace_id=task.workspace_id,
            task_id=task.id,
            event_type="comment",
            field_name="comment",
            old_value="",
            new_value=body,
        )
        _notify(task.assignee_id, task.workspace_id, task.id, f"New comment on '{task.title}'.")
        db.session.commit()
        return jsonify({"ok": True, "id": comment.id})

    @app.get("/api/notifications")
    @login_required
    def api_notifications():
        items = (
            Notification.query.filter_by(recipient_id=current_user.id)
            .order_by(Notification.created_at.desc())
            .limit(30)
            .all()
        )
        actor_ids = {item.actor_id for item in items if item.actor_id}
        actors = {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
        unread_count = Notification.query.filter_by(recipient_id=current_user.id, is_read=False).count()
        return jsonify(
            {
                "unread_count": unread_count,
                "items": [
                    {
                        "id": item.id,
                        "body": item.body,
                        "is_read": item.is_read,
                        "actor": actors[item.actor_id].display_name if item.actor_id in actors else "System",
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in items
                ],
            }
        )

    @app.post("/api/notifications/<int:notif_id>/read")
    @login_required
    def api_notification_read(notif_id):
        notif = Notification.query.filter_by(id=notif_id, recipient_id=current_user.id).first_or_404()
        notif.is_read = True
        notif.read_at = datetime.utcnow()
        db.session.commit()
        return jsonify({"ok": True})

    @app.post("/api/notifications/read-all")
    @login_required
    def api_notifications_read_all():
        Notification.query.filter_by(recipient_id=current_user.id, is_read=False).update(
            {"is_read": True, "read_at": datetime.utcnow()}
        )
        db.session.commit()
        return jsonify({"ok": True})

    @app.get("/export/tasks.csv")
    @login_required
    def export_tasks_csv():
        ws = _current_workspace_or_redirect()
        if not ws:
            abort(403)
        _ensure_workspace_member(ws.id)
        tasks = Task.query.filter_by(workspace_id=ws.id).order_by(Task.created_at.asc()).all()
        assignee_ids = {task.assignee_id for task in tasks if task.assignee_id}
        users = {u.id: u for u in User.query.filter(User.id.in_(assignee_ids)).all()} if assignee_ids else {}

        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["task_id", "title", "status", "priority", "due_date", "assignee", "created_at", "updated_at"])
        for task in tasks:
            writer.writerow(
                [
                    task.id,
                    task.title,
                    task.status,
                    task.priority,
                    task.due_date.isoformat() if task.due_date else "",
                    users[task.assignee_id].display_name if task.assignee_id in users else "",
                    task.created_at.isoformat(),
                    task.updated_at.isoformat(),
                ]
            )
        csv_bytes = io.BytesIO(stream.getvalue().encode("utf-8"))
        return send_file(csv_bytes, mimetype="text/csv", as_attachment=True, download_name=f"workspace-{ws.id}-tasks.csv")

    @app.get("/export/workload.csv")
    @login_required
    def export_workload_csv():
        ws = _current_workspace_or_redirect()
        if not ws:
            abort(403)
        _ensure_workspace_member(ws.id)
        members = WorkspaceMember.query.filter_by(workspace_id=ws.id).all()
        users = {u.id: u for u in User.query.filter(User.id.in_([m.user_id for m in members])).all()}

        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["user", "role", "todo", "in_progress", "review", "done", "total"])
        for member in members:
            counts = {
                status: Task.query.filter_by(workspace_id=ws.id, assignee_id=member.user_id, status=status).count()
                for status in STATUSES
            }
            total = sum(counts.values())
            writer.writerow(
                [
                    users[member.user_id].display_name,
                    member.role,
                    counts["todo"],
                    counts["in_progress"],
                    counts["review"],
                    counts["done"],
                    total,
                ]
            )
        csv_bytes = io.BytesIO(stream.getvalue().encode("utf-8"))
        return send_file(
            csv_bytes,
            mimetype="text/csv",
            as_attachment=True,
            download_name=f"workspace-{ws.id}-workload.csv",
        )

    @app.get("/export/summary.pdf")
    @login_required
    def export_summary_pdf():
        ws = _current_workspace_or_redirect()
        if not ws:
            abort(403)
        _ensure_workspace_member(ws.id)
        tasks = Task.query.filter_by(workspace_id=ws.id).all()
        counts = {status: 0 for status in STATUSES}
        for task in tasks:
            counts[task.status] += 1

        lines = [
            "CollabFlow Workspace Summary",
            f"Workspace: {ws.name}",
            f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
            "",
            f"Total tasks: {len(tasks)}",
            f"To Do: {counts['todo']}",
            f"In Progress: {counts['in_progress']}",
            f"Review: {counts['review']}",
            f"Done: {counts['done']}",
        ]
        pdf_data = _simple_pdf(lines)
        return send_file(
            io.BytesIO(pdf_data),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"workspace-{ws.id}-summary.pdf",
        )
