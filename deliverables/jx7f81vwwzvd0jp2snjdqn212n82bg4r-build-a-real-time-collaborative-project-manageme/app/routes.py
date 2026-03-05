from datetime import datetime, timedelta
import secrets
from flask import render_template, request, redirect, url_for, flash, abort, jsonify, make_response
from flask_login import login_user, logout_user, login_required, current_user
from sqlalchemy import or_
from .models import db, User, Workspace, WorkspaceMember, Task, Comment, Activity, Notification, Invite, SessionToken

STATUSES = ['todo', 'in_progress', 'review', 'done']

def in_workspace(ws_id):
    return WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=current_user.id).first() is not None

def ws_role(ws_id):
    m = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=current_user.id).first()
    return m.role if m else None

def _issue_session(user):
    token = secrets.token_urlsafe(32)
    st = SessionToken(user_id=user.id, token=token, expires_at=datetime.utcnow() + timedelta(days=14))
    db.session.add(st); db.session.commit()
    return token


def register_routes(app):
    @app.route('/')
    def root():
        return redirect(url_for('board')) if current_user.is_authenticated else redirect(url_for('login'))

    @app.route('/signup', methods=['GET','POST'])
    def signup():
        if request.method == 'POST':
            email = request.form['email'].strip().lower()
            if User.query.filter_by(email=email).first():
                flash('Email already exists', 'danger')
                return render_template('signup.html')
            u = User(email=email, display_name=request.form.get('display_name') or request.form.get('name') or email.split('@')[0], avatar_color='#4f46e5')
            u.set_password(request.form['password'])
            db.session.add(u); db.session.commit(); login_user(u, remember=True)
            tok = _issue_session(u)
            resp = make_response(redirect(url_for('workspaces')))
            resp.set_cookie('session_token', tok, max_age=60*60*24*14)
            return resp
        return render_template('signup.html')

    @app.route('/login', methods=['GET','POST'])
    def login():
        if request.method == 'POST':
            u = User.query.filter_by(email=request.form['email'].strip().lower()).first()
            if u and u.check_password(request.form['password']):
                login_user(u, remember=True)
                tok = _issue_session(u)
                resp = make_response(redirect(url_for('workspaces')))
                resp.set_cookie('session_token', tok, max_age=60*60*24*14)
                return resp
            flash('Invalid credentials', 'danger')
        return render_template('login.html')

    @app.route('/logout')
    @login_required
    def logout():
        logout_user(); return redirect(url_for('login'))

    @app.route('/workspaces', methods=['GET','POST'])
    @login_required
    def workspaces():
        if request.method == 'POST':
            ws = Workspace(name=request.form['name'], owner_id=current_user.id, invite_slug=secrets.token_urlsafe(8))
            db.session.add(ws); db.session.flush()
            db.session.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role='admin'))
            db.session.commit()
            return redirect(url_for('set_workspace', ws_id=ws.id))
        rows = Workspace.query.join(WorkspaceMember, Workspace.id==WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id==current_user.id).all()
        return render_template('workspaces.html', rows=rows)

    @app.route('/workspace/<int:ws_id>/set')
    @app.route('/workspace/<int:ws_id>/select')
    @login_required
    def set_workspace(ws_id):
        if not in_workspace(ws_id): abort(403)
        resp = make_response(redirect(url_for('board', ws_id=ws_id)))
        resp.set_cookie('ws_id', str(ws_id), max_age=60*60*24*30)
        return resp

    @app.route('/invite/<slug>')
    @login_required
    def join_via_slug(slug):
        ws = Workspace.query.filter_by(invite_slug=slug).first_or_404()
        if not in_workspace(ws.id):
            db.session.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role='member')); db.session.commit()
        return redirect(url_for('set_workspace', ws_id=ws.id))

    @app.post('/workspace/<int:ws_id>/invite')
    @login_required
    def invite_ws(ws_id):
        if ws_role(ws_id) != 'admin':
            abort(403)
        email = request.form['email'].strip().lower()
        token = secrets.token_urlsafe(24)
        db.session.add(Invite(workspace_id=ws_id, email=email, token=token, invited_by=current_user.id, expires_at=datetime.utcnow()+timedelta(days=7)))
        db.session.commit()
        return redirect(url_for('members'))

    @app.route('/invite/<token>', methods=['POST'])
    def accept_invite_post(token):
        inv = Invite.query.filter_by(token=token).first_or_404()
        if inv.expires_at < datetime.utcnow():
            abort(410)
        email = request.form['email'].strip().lower()
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(email=email, display_name=request.form.get('display_name', email.split('@')[0]), avatar_color='#4f46e5')
            user.set_password(request.form['password'])
            db.session.add(user); db.session.flush()
        if not WorkspaceMember.query.filter_by(workspace_id=inv.workspace_id, user_id=user.id).first():
            db.session.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=user.id, role='member'))
        inv.accepted_at = datetime.utcnow(); db.session.commit(); login_user(user, remember=True)
        return redirect(url_for('set_workspace', ws_id=inv.workspace_id))

    @app.route('/workspace/members', methods=['GET','POST'])
    @app.route('/members', methods=['GET','POST'])
    @login_required
    def members():
        ws_id = int(request.cookies.get('ws_id','0'))
        if not in_workspace(ws_id): return redirect(url_for('workspaces'))
        admin = ws_role(ws_id) == 'admin'
        if request.method == 'POST':
            if not admin: abort(403)
            if request.form.get('target_user_id'):
                target = WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=int(request.form['target_user_id'])).first()
                if target:
                    target.role = request.form.get('role', target.role)
                    db.session.commit()
            else:
                email = request.form['email'].strip().lower()
                user = User.query.filter_by(email=email).first()
                token = secrets.token_urlsafe(24)
                db.session.add(Invite(workspace_id=ws_id, email=email, token=token, invited_by=current_user.id, expires_at=datetime.utcnow()+timedelta(days=7)))
                if user and not in_workspace(ws_id):
                    db.session.add(WorkspaceMember(workspace_id=ws_id, user_id=user.id, role='member'))
                db.session.commit(); flash(f'Invite link: /invites/{token}', 'info')
        rows = WorkspaceMember.query.filter_by(workspace_id=ws_id).all()
        users = {u.id:u for u in User.query.all()}
        ws = db.session.get(Workspace, ws_id)
        workload = []
        for m in rows:
            workload.append((users[m.user_id], {s: Task.query.filter_by(workspace_id=ws_id, assignee_id=m.user_id, status=s).count() for s in STATUSES}))
        return render_template('members.html', rows=rows, users=users, admin=admin, ws=ws, workload=workload)

    @app.route('/invites/<token>/accept')
    @login_required
    def accept_invite(token):
        inv = Invite.query.filter_by(token=token).first_or_404()
        if inv.expires_at < datetime.utcnow(): abort(410)
        if not in_workspace(inv.workspace_id):
            db.session.add(WorkspaceMember(workspace_id=inv.workspace_id, user_id=current_user.id, role='member'))
        inv.accepted_at = datetime.utcnow(); db.session.commit()
        return redirect(url_for('set_workspace', ws_id=inv.workspace_id))

    @app.route('/workspace/member/<int:mid>/remove', methods=['POST'])
    @login_required
    def remove_member(mid):
        ws_id = int(request.cookies.get('ws_id','0'))
        if ws_role(ws_id) != 'admin': abort(403)
        target = db.session.get(WorkspaceMember, mid)
        if target and target.workspace_id == ws_id and target.user_id != current_user.id:
            db.session.delete(target); db.session.commit()
        return redirect(url_for('members'))

    @app.route('/workspace/member/<int:mid>/role', methods=['POST'])
    @login_required
    def set_role(mid):
        ws_id = int(request.cookies.get('ws_id','0'))
        if ws_role(ws_id) != 'admin': abort(403)
        target = db.session.get(WorkspaceMember, mid)
        if target and target.workspace_id == ws_id:
            target.role = request.form.get('role','member')
            db.session.commit()
        return redirect(url_for('members'))

    @app.route('/board', methods=['GET','POST'])
    @login_required
    def board():
        ws_id = int(request.args.get('ws_id', request.cookies.get('ws_id','0')))
        if ws_id == 0: return redirect(url_for('workspaces'))
        if not in_workspace(ws_id): abort(403)
        q = request.args.get('q','').strip()
        query = Task.query.filter_by(workspace_id=ws_id)
        if q:
            like = f'%{q}%'
            query = query.filter(or_(Task.title.ilike(like), Task.description.ilike(like)))
        if request.method == 'POST':
            due = datetime.strptime(request.form['due_date'],'%Y-%m-%d').date() if request.form.get('due_date') else None
            aid = int(request.form['assignee_id']) if request.form.get('assignee_id') else None
            t = Task(workspace_id=ws_id, title=request.form['title'], description=request.form.get('description',''), due_date=due, priority=request.form.get('priority','medium'), assignee_id=aid, created_by=current_user.id, status='todo')
            db.session.add(t); db.session.flush()
            db.session.add(Activity(task_id=t.id, actor_id=current_user.id, event_type='create', detail='task created'))
            if aid and aid != current_user.id:
                db.session.add(Notification(recipient_id=aid, actor_id=current_user.id, workspace_id=ws_id, task_id=t.id, body=f'assigned task: {t.title}'))
            db.session.commit(); return redirect(url_for('board'))
        tasks = query.order_by(Task.updated_at.desc()).all()
        members = WorkspaceMember.query.filter_by(workspace_id=ws_id).all()
        users = [db.session.get(User,m.user_id) for m in members]
        cols = {s:[t for t in tasks if t.status==s] for s in STATUSES}
        counts = {s:len(cols[s]) for s in STATUSES}
        return render_template('board.html', cols=cols, counts=counts, users=users, q=q, now=datetime.utcnow().date())

    @app.post('/api/task')
    @login_required
    def api_create_task():
        ws_id = int(request.cookies.get('ws_id','0'))
        if not in_workspace(ws_id): abort(403)
        d = request.get_json()
        t = Task(workspace_id=ws_id, title=d['title'], description=d.get('description',''), priority=d.get('priority','medium'), status=d.get('status','todo'), assignee_id=d.get('assignee_id'), created_by=current_user.id)
        db.session.add(t); db.session.flush()
        db.session.add(Activity(task_id=t.id, actor_id=current_user.id, event_type='create', detail='task created'))
        db.session.commit()
        return jsonify({'id': t.id})

    @app.get('/api/board')
    @login_required
    def api_board():
        ws_id = int(request.cookies.get('ws_id','0'))
        if not in_workspace(ws_id): abort(403)
        tasks = Task.query.filter_by(workspace_id=ws_id).all()
        cols = {s:[{'id':t.id,'title':t.title} for t in tasks if t.status==s] for s in STATUSES}
        return jsonify({'columns': cols})

    @app.get('/api/task/<int:tid>')
    @login_required
    def api_task_detail(tid):
        t = db.session.get(Task, tid)
        if not t or not in_workspace(t.workspace_id): abort(404)
        return jsonify({'task': {'id':t.id,'status':t.status,'title':t.title}})

    @app.post('/api/task/<int:tid>/move')
    @app.post('/api/tasks/<int:tid>/move')
    @login_required
    def move_task(tid):
        t = db.session.get(Task, tid)
        if not t or not in_workspace(t.workspace_id): abort(404)
        status = request.json.get('status')
        if status not in STATUSES: return jsonify({'ok':False}), 400
        old = t.status; t.status = status
        db.session.add(Activity(task_id=t.id, actor_id=current_user.id, event_type='status', detail=f'{old}->{status}'))
        db.session.commit(); return jsonify({'ok':True, 'status':status})

    @app.route('/task/<int:tid>', methods=['GET','POST'])
    @login_required
    def task_detail(tid):
        t = db.session.get(Task, tid)
        if not t or not in_workspace(t.workspace_id): abort(404)
        members = [db.session.get(User,m.user_id) for m in WorkspaceMember.query.filter_by(workspace_id=t.workspace_id).all()]
        if request.method == 'POST':
            if 'comment' in request.form:
                c = Comment(task_id=t.id, user_id=current_user.id, body=request.form['comment'])
                db.session.add(c)
                db.session.add(Activity(task_id=t.id, actor_id=current_user.id, event_type='comment', detail='comment added'))
                if t.assignee_id and t.assignee_id != current_user.id:
                    db.session.add(Notification(recipient_id=t.assignee_id, actor_id=current_user.id, workspace_id=t.workspace_id, task_id=t.id, body=f'commented on {t.title}'))
            else:
                old = {'title':t.title, 'description':t.description, 'priority':t.priority, 'due_date':str(t.due_date), 'assignee_id':t.assignee_id, 'status':t.status}
                t.title = request.form['title']; t.description=request.form.get('description',''); t.priority=request.form.get('priority','medium'); t.status=request.form.get('status',t.status)
                t.assignee_id = int(request.form['assignee_id']) if request.form.get('assignee_id') else None
                t.due_date = datetime.strptime(request.form['due_date'],'%Y-%m-%d').date() if request.form.get('due_date') else None
                db.session.add(Activity(task_id=t.id, actor_id=current_user.id, event_type='edit', detail=f"{old} -> {{'title':{t.title},'status':{t.status}}}"))
            db.session.commit(); return redirect(url_for('task_detail', tid=t.id))
        comments = Comment.query.filter_by(task_id=t.id).order_by(Comment.id.desc()).all()
        history = Activity.query.filter_by(task_id=t.id).order_by(Activity.id.desc()).all()
        user_map = {u.id:u for u in User.query.all()}
        return render_template('task_detail.html', t=t, comments=comments, history=history, user_map=user_map, members=members)

    @app.route('/notifications')
    @login_required
    def notifications():
        rows = Notification.query.filter_by(recipient_id=current_user.id).order_by(Notification.id.desc()).all()
        return render_template('notifications.html', rows=rows)

    @app.post('/notifications/<int:nid>/read')
    @login_required
    def mark_notification(nid):
        n = db.session.get(Notification, nid)
        if n and n.recipient_id == current_user.id:
            n.is_read = True; db.session.commit()
        return redirect(url_for('notifications'))

    @app.route('/activity')
    @login_required
    def activity_feed():
        ws_id = int(request.cookies.get('ws_id','0'))
        if not in_workspace(ws_id): return redirect(url_for('workspaces'))
        rows = Activity.query.join(Task, Activity.task_id==Task.id).filter(Task.workspace_id==ws_id).order_by(Activity.id.desc()).limit(200).all()
        users = {u.id:u for u in User.query.all()}
        return render_template('overview.html', data=rows, users=users)
