import secrets
from datetime import datetime

from flask import Blueprint, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user

from . import db
from .models import Activity, Comment, Notification, SessionToken, Task, User, Workspace, WorkspaceMember

bp = Blueprint('main', __name__)


def _issue_token(user_id):
    token = secrets.token_hex(32)
    db.session.add(SessionToken(user_id=user_id, token=token))
    db.session.commit()
    return token


def _set_workspace(ws_id):
    session['workspace_id'] = ws_id


def _current_ws():
    return session.get('workspace_id')


def _require_member(ws_id):
    return WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=current_user.id).first()


@bp.before_app_request
def restore_from_cookie():
    if current_user.is_authenticated:
        return
    token = request.cookies.get('session_token')
    if not token:
        return
    st = SessionToken.query.filter_by(token=token).first()
    if st:
        user = db.session.get(User, st.user_id)
        if user:
            login_user(user, remember=True)


@bp.route('/')
def root():
    return redirect(url_for('main.workspaces') if current_user.is_authenticated else url_for('main.login'))


@bp.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        if User.query.filter_by(email=email).first():
            flash('Email already in use', 'danger')
            return redirect(url_for('main.signup'))
        u = User(email=email)
        u.set_password(request.form['password'])
        db.session.add(u)
        db.session.commit()
        login_user(u, remember=True)
        token = _issue_token(u.id)
        resp = redirect(url_for('main.workspaces'))
        resp.set_cookie('session_token', token, max_age=60 * 60 * 24 * 30, httponly=True, samesite='Lax')
        return resp
    return render_template('signup.html')


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        u = User.query.filter_by(email=request.form['email'].strip().lower()).first()
        if u and u.check_password(request.form['password']):
            login_user(u, remember=True)
            token = _issue_token(u.id)
            memberships = WorkspaceMember.query.filter_by(user_id=u.id).all()
            for m in memberships:
                m.online = True
            db.session.commit()
            resp = redirect(url_for('main.workspaces'))
            resp.set_cookie('session_token', token, max_age=60 * 60 * 24 * 30, httponly=True, samesite='Lax')
            return resp
        flash('Invalid credentials', 'danger')
    return render_template('login.html')


@bp.route('/logout')
@login_required
def logout():
    for m in WorkspaceMember.query.filter_by(user_id=current_user.id).all():
        m.online = False
    db.session.commit()
    logout_user()
    resp = redirect(url_for('main.login'))
    resp.delete_cookie('session_token')
    return resp


@bp.route('/workspaces', methods=['GET', 'POST'])
@login_required
def workspaces():
    if request.method == 'POST':
        ws = Workspace(name=request.form['name'], owner_id=current_user.id)
        db.session.add(ws)
        db.session.flush()
        db.session.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role='admin', online=True))
        db.session.commit()
        _set_workspace(ws.id)
        return redirect(url_for('main.board', workspace_id=ws.id))
    memberships = WorkspaceMember.query.filter_by(user_id=current_user.id).all()
    all_ws = [db.session.get(Workspace, m.workspace_id) for m in memberships]
    return render_template('workspaces.html', workspaces=all_ws, invites=[])


@bp.route('/workspace/<int:workspace_id>/select')
@login_required
def select_workspace(workspace_id):
    if not _require_member(workspace_id):
        return 'Forbidden', 403
    _set_workspace(workspace_id)
    return redirect(url_for('main.board', workspace_id=workspace_id))


@bp.route('/members', methods=['GET', 'POST'])
@login_required
def members():
    ws_id = _current_ws()
    if not ws_id:
        return redirect(url_for('main.workspaces'))
    me = _require_member(ws_id)
    if not me:
        return 'Forbidden', 403
    if request.method == 'POST' and me.role == 'admin':
        target = int(request.form['target_user_id'])
        role = request.form.get('role', 'member')
        m = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=target).first()
        if m:
            m.role = role
            db.session.commit()
    rows = []
    for m in WorkspaceMember.query.filter_by(workspace_id=ws_id).all():
        u = db.session.get(User, m.user_id)
        rows.append((m, u))
    return render_template('members.html', rows=rows, workspace_id=ws_id)


@bp.route('/members/remove/<int:user_id>', methods=['POST'])
@login_required
def remove_member(user_id):
    ws_id = _current_ws()
    me = _require_member(ws_id)
    if not me or me.role != 'admin':
        return 'Forbidden', 403
    WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=user_id).delete()
    db.session.commit()
    return redirect(url_for('main.members'))


@bp.route('/board')
@bp.route('/w/<int:workspace_id>/tasks', methods=['GET', 'POST'])
@bp.route('/board/<int:workspace_id>', methods=['GET'])
@login_required
def board(workspace_id=None):
    ws_id = workspace_id or _current_ws()
    if not ws_id:
        return redirect(url_for('main.workspaces'))
    if not _require_member(ws_id):
        return 'Forbidden', 403
    _set_workspace(ws_id)

    if request.method == 'POST':
        t = Task(
            workspace_id=ws_id,
            title=request.form['title'],
            description=request.form.get('description', ''),
            priority=request.form.get('priority', 'Medium'),
            status=request.form.get('status', 'To Do'),
            assignee_id=int(request.form['assignee_id']) if request.form.get('assignee_id') else None,
            created_by=current_user.id,
        )
        db.session.add(t)
        db.session.flush()
        db.session.add(Activity(task_id=t.id, actor_id=current_user.id, field_name='create', detail='Task created'))
        if t.assignee_id and t.assignee_id != current_user.id:
            db.session.add(Notification(recipient_id=t.assignee_id, title='Task assignment', body=f'Assigned: {t.title}'))
        db.session.commit()
        return 'OK', 200

    q = request.args.get('q', '').strip().lower()
    tasks = Task.query.filter_by(workspace_id=ws_id).order_by(Task.id.desc()).all()
    if q:
        tasks = [t for t in tasks if q in (t.title or '').lower() or q in (t.description or '').lower()]
    statuses = ['To Do', 'In Progress', 'Review', 'Done']
    columns = {s: [] for s in statuses}
    for t in tasks:
        columns[t.status].append(t)
    users = [db.session.get(User, m.user_id) for m in WorkspaceMember.query.filter_by(workspace_id=ws_id).all()]
    presence = [u for u in users if WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=u.id, online=True).first()]
    return render_template('board.html', workspace_id=ws_id, statuses=statuses, columns=columns, users=users, presence=presence)


@bp.route('/task/<int:task_id>/update', methods=['POST'])
@login_required
def update_task(task_id):
    t = db.session.get(Task, task_id)
    if not t or not _require_member(t.workspace_id):
        return 'Forbidden', 403
    old_status = t.status
    t.title = request.form.get('title', t.title)
    t.description = request.form.get('description', t.description)
    t.priority = request.form.get('priority', t.priority)
    t.status = request.form.get('status', t.status)
    due = request.form.get('due_date', '').strip()
    t.due_date = datetime.strptime(due, '%Y-%m-%d').date() if due else None
    t.assignee_id = int(request.form['assignee_id']) if request.form.get('assignee_id') else None
    db.session.add(Activity(task_id=t.id, actor_id=current_user.id, field_name='status', old_value=old_status, new_value=t.status, detail='Task updated'))
    db.session.commit()
    return 'OK', 200


@bp.route('/task/<int:task_id>/comment', methods=['POST'])
@login_required
def comment_task(task_id):
    t = db.session.get(Task, task_id)
    if not t or not _require_member(t.workspace_id):
        return 'Forbidden', 403
    body = request.form.get('body', '').strip()
    if not body:
        return 'Missing comment', 400
    db.session.add(Comment(task_id=t.id, author_id=current_user.id, body=body))
    db.session.add(Activity(task_id=t.id, actor_id=current_user.id, field_name='comment', new_value=body, detail='Comment added'))
    if t.assignee_id and t.assignee_id != current_user.id:
        db.session.add(Notification(recipient_id=t.assignee_id, title='New comment', body=f'Comment on {t.title}'))
    db.session.commit()
    return 'OK', 200


@bp.route('/notifications')
@login_required
def notifications():
    items = Notification.query.filter_by(recipient_id=current_user.id).order_by(Notification.id.desc()).all()
    if request.accept_mimetypes.best == 'application/json' or request.args.get('format') == 'json':
        return jsonify([{'id': n.id, 'title': n.title, 'body': n.body, 'read': n.read} for n in items])
    return render_template('notifications.html', items=items)


def register_routes(app):
    app.register_blueprint(bp)
