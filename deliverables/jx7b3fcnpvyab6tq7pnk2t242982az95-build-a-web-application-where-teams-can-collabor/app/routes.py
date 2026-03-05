import secrets
from datetime import datetime
from functools import wraps
from flask import Blueprint, render_template, request, redirect, url_for, flash, abort, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from . import db
from .models import User, Workspace, WorkspaceMember, Invite, Task, TaskComment, TaskNote, TaskHistory, Notification

bp = Blueprint('main', __name__)


def member_required(fn):
    @wraps(fn)
    def wrapper(workspace_id, *args, **kwargs):
        m = WorkspaceMember.query.filter_by(workspace_id=workspace_id, user_id=current_user.id).first()
        if not m:
            abort(403)
        return fn(workspace_id, *args, **kwargs)
    return wrapper


def admin_required(workspace_id):
    m = WorkspaceMember.query.filter_by(workspace_id=workspace_id, user_id=current_user.id).first()
    return bool(m and m.role == 'Admin')


def notify(user_id, title, body):
    db.session.add(Notification(user_id=user_id, title=title, body=body))


def hist(task_id, action, detail):
    db.session.add(TaskHistory(task_id=task_id, actor_id=current_user.id, action=action, detail=detail))


@bp.route('/')
def root():
    return redirect(url_for('main.workspaces') if current_user.is_authenticated else url_for('main.login'))


@bp.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        if User.query.filter_by(email=email).first():
            flash('Email already exists', 'danger')
            return redirect(url_for('main.signup'))
        u = User(email=email)
        u.set_password(request.form['password'])
        db.session.add(u)
        db.session.commit()
        login_user(u, remember=True)
        return redirect(url_for('main.workspaces'))
    return render_template('signup.html')


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.workspaces'))
    if request.method == 'POST':
        u = User.query.filter_by(email=request.form['email'].strip().lower()).first()
        if u and u.check_password(request.form['password']):
            login_user(u, remember=True)
            return redirect(url_for('main.workspaces'))
        flash('Invalid credentials', 'danger')
    return render_template('login.html')


@bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('main.login'))


@bp.route('/workspaces', methods=['GET', 'POST'])
@login_required
def workspaces():
    if request.method == 'POST':
        ws = Workspace(name=request.form['name'], owner_id=current_user.id)
        db.session.add(ws)
        db.session.flush()
        db.session.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role='Admin'))
        db.session.commit()
        return redirect(url_for('main.board', workspace_id=ws.id))

    my_memberships = WorkspaceMember.query.filter_by(user_id=current_user.id).all()
    my_workspaces = [db.session.get(Workspace, m.workspace_id) for m in my_memberships]
    invites = Invite.query.filter_by(email=current_user.email, accepted=False).all()
    return render_template('workspaces.html', workspaces=my_workspaces, invites=invites)


@bp.route('/invite/<token>/accept', methods=['POST'])
@login_required
def accept_invite(token):
    inv = Invite.query.filter_by(token=token, accepted=False, email=current_user.email).first_or_404()
    if not WorkspaceMember.query.filter_by(workspace_id=inv.workspace_id, user_id=current_user.id).first():
        db.session.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=current_user.id, role='Member'))
    inv.accepted = True
    db.session.commit()
    return redirect(url_for('main.board', workspace_id=inv.workspace_id))


@bp.route('/w/<int:workspace_id>/members', methods=['GET', 'POST'])
@login_required
@member_required
def members(workspace_id):
    if request.method == 'POST':
        if not admin_required(workspace_id):
            abort(403)
        token = secrets.token_hex(16)
        inv = Invite(workspace_id=workspace_id, email=request.form['email'].strip().lower(), token=token)
        db.session.add(inv)
        db.session.commit()
        flash(f'Invite created: token={token}', 'success')

    ws = db.session.get(Workspace, workspace_id)
    member_rows = WorkspaceMember.query.filter_by(workspace_id=workspace_id).all()
    data = []
    for m in member_rows:
        user = db.session.get(User, m.user_id)
        in_progress = Task.query.filter_by(workspace_id=workspace_id, assignee_id=user.id, status='In Progress').count()
        data.append({'member': m, 'user': user, 'in_progress': in_progress})
    return render_template('members.html', ws=ws, rows=data, is_admin=admin_required(workspace_id))


@bp.route('/w/<int:workspace_id>/members/<int:user_id>/remove', methods=['POST'])
@login_required
@member_required
def remove_member(workspace_id, user_id):
    if not admin_required(workspace_id):
        abort(403)
    m = WorkspaceMember.query.filter_by(workspace_id=workspace_id, user_id=user_id).first_or_404()
    if m.user_id == current_user.id:
        flash('Admin cannot remove self', 'danger')
        return redirect(url_for('main.members', workspace_id=workspace_id))
    db.session.delete(m)
    db.session.commit()
    return redirect(url_for('main.members', workspace_id=workspace_id))


@bp.route('/w/<int:workspace_id>/board', methods=['GET', 'POST'])
@login_required
@member_required
def board(workspace_id):
    if request.method == 'POST':
        due = request.form.get('due_date')
        assignee = request.form.get('assignee_id', type=int)
        t = Task(
            workspace_id=workspace_id,
            title=request.form['title'],
            description=request.form.get('description'),
            due_date=datetime.strptime(due, '%Y-%m-%d').date() if due else None,
            priority=request.form['priority'],
            assignee_id=assignee,
            created_by=current_user.id,
        )
        db.session.add(t)
        db.session.flush()
        hist(t.id, 'create', 'Task created')
        if assignee and assignee != current_user.id:
            notify(assignee, 'Task assigned', f'You were assigned: {t.title}')
        db.session.commit()
        return redirect(url_for('main.board', workspace_id=workspace_id))

    tasks = Task.query.filter_by(workspace_id=workspace_id).order_by(Task.id.desc()).all()
    members = WorkspaceMember.query.filter_by(workspace_id=workspace_id).all()
    users = [db.session.get(User, m.user_id) for m in members]
    columns = {'Todo': [], 'In Progress': [], 'Done': []}
    for t in tasks:
        columns.setdefault(t.status, []).append(t)
    return render_template('board.html', workspace_id=workspace_id, columns=columns, users=users)


@bp.route('/task/<int:task_id>')
@login_required
def task_detail(task_id):
    t = Task.query.get_or_404(task_id)
    m = WorkspaceMember.query.filter_by(workspace_id=t.workspace_id, user_id=current_user.id).first()
    if not m:
        abort(403)
    comments = TaskComment.query.filter_by(task_id=task_id).order_by(TaskComment.id.desc()).all()
    notes = TaskNote.query.filter_by(task_id=task_id).order_by(TaskNote.id.desc()).all()
    history = TaskHistory.query.filter_by(task_id=task_id).order_by(TaskHistory.id.desc()).all()
    users = [db.session.get(User, mm.user_id) for mm in WorkspaceMember.query.filter_by(workspace_id=t.workspace_id).all()]
    return render_template('task_detail.html', task=t, comments=comments, notes=notes, history=history, users=users)


@bp.route('/task/<int:task_id>/status', methods=['POST'])
@login_required
def update_task_status(task_id):
    t = Task.query.get_or_404(task_id)
    if not WorkspaceMember.query.filter_by(workspace_id=t.workspace_id, user_id=current_user.id).first():
        abort(403)
    new_status = request.form['status']
    t.status = new_status
    hist(t.id, 'status', f'Moved to {new_status}')
    db.session.commit()
    if request.accept_mimetypes.best == 'application/json':
        return jsonify({'ok': True})
    return redirect(url_for('main.board', workspace_id=t.workspace_id))


@bp.route('/task/<int:task_id>/assign', methods=['POST'])
@login_required
def assign_task(task_id):
    t = Task.query.get_or_404(task_id)
    if not WorkspaceMember.query.filter_by(workspace_id=t.workspace_id, user_id=current_user.id).first():
        abort(403)
    uid = request.form.get('assignee_id', type=int)
    t.assignee_id = uid
    hist(t.id, 'assign', f'Assigned to user {uid}')
    if uid and uid != current_user.id:
        notify(uid, 'Task assigned', f'You were assigned: {t.title}')
    db.session.commit()
    return redirect(url_for('main.task_detail', task_id=t.id))


@bp.route('/task/<int:task_id>/comment', methods=['POST'])
@login_required
def add_comment(task_id):
    t = Task.query.get_or_404(task_id)
    if not WorkspaceMember.query.filter_by(workspace_id=t.workspace_id, user_id=current_user.id).first():
        abort(403)
    c = TaskComment(task_id=task_id, author_id=current_user.id, body=request.form['body'])
    db.session.add(c)
    hist(task_id, 'comment', 'Comment added')
    if t.assignee_id and t.assignee_id != current_user.id:
        notify(t.assignee_id, 'New comment', f'New comment on task: {t.title}')
    db.session.commit()
    return redirect(url_for('main.task_detail', task_id=task_id))


@bp.route('/task/<int:task_id>/note', methods=['POST'])
@login_required
def add_note(task_id):
    t = Task.query.get_or_404(task_id)
    if not WorkspaceMember.query.filter_by(workspace_id=t.workspace_id, user_id=current_user.id).first():
        abort(403)
    n = TaskNote(task_id=task_id, author_id=current_user.id, body=request.form['body'])
    db.session.add(n)
    hist(task_id, 'note', 'Note attached')
    db.session.commit()
    return redirect(url_for('main.task_detail', task_id=task_id))


@bp.route('/notifications')
@login_required
def notifications():
    rows = Notification.query.filter_by(user_id=current_user.id).order_by(Notification.id.desc()).all()
    return render_template('notifications.html', notifications=rows)
