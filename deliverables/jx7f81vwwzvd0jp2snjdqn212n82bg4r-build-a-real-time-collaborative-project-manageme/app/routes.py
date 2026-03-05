import secrets
from datetime import datetime, timedelta, date
from flask import render_template, request, redirect, url_for, jsonify, abort, make_response
from flask_login import login_user, logout_user, login_required, current_user
from .models import db, User, Workspace, WorkspaceMember, Task, Comment, Activity, Notification, SessionToken

STATUSES = ['todo', 'in_progress', 'review', 'done']


def register_routes(app):
    def ws_id(): return int(request.cookies.get('ws_id', '0'))

    def require_member(workspace_id):
        m = WorkspaceMember.query.filter_by(workspace_id=workspace_id, user_id=current_user.id).first()
        if not m: abort(403)
        return m

    def member_users(workspace_id):
        mids = [m.user_id for m in WorkspaceMember.query.filter_by(workspace_id=workspace_id).all()]
        return User.query.filter(User.id.in_(mids)).all() if mids else []

    def add_activity(task_id, field, old_v, new_v):
        db.session.add(Activity(task_id=task_id, user_id=current_user.id, field=field, old_value=str(old_v or ''), new_value=str(new_v or '')))

    def notify(uid, workspace_id, msg):
        if uid and uid != current_user.id:
            db.session.add(Notification(recipient_id=uid, workspace_id=workspace_id, message=msg))

    @app.route('/')
    def home():
        return redirect(url_for('board')) if current_user.is_authenticated else redirect(url_for('login'))

    @app.route('/signup', methods=['GET', 'POST'])
    def signup():
        if request.method == 'POST':
            email = request.form['email'].strip().lower()
            if User.query.filter_by(email=email).first():
                return render_template('auth.html', mode='signup', error='Email already exists')
            u = User(email=email, avatar=(email[:1] or 'U').upper())
            u.set_password(request.form['password'])
            db.session.add(u); db.session.commit()
            login_user(u, remember=True)
            token = secrets.token_hex(16)
            db.session.add(SessionToken(user_id=u.id, token=token, expires_at=datetime.utcnow()+timedelta(days=30))); db.session.commit()
            return redirect(url_for('workspaces'))
        return render_template('auth.html', mode='signup')

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            u = User.query.filter_by(email=request.form['email'].strip().lower()).first()
            if u and u.check_password(request.form['password']):
                login_user(u, remember=True)
                token = secrets.token_hex(16)
                db.session.add(SessionToken(user_id=u.id, token=token, expires_at=datetime.utcnow()+timedelta(days=30))); db.session.commit()
                return redirect(url_for('workspaces'))
            return render_template('auth.html', mode='login', error='Invalid credentials')
        return render_template('auth.html', mode='login')

    @app.route('/logout')
    @login_required
    def logout():
        logout_user(); return redirect(url_for('login'))

    @app.route('/workspaces', methods=['GET', 'POST'])
    @login_required
    def workspaces():
        if request.method == 'POST':
            name = request.form['name'].strip()
            w = Workspace(name=name, invite_code=secrets.token_hex(6), owner_id=current_user.id)
            db.session.add(w); db.session.flush()
            db.session.add(WorkspaceMember(workspace_id=w.id, user_id=current_user.id, role='admin'))
            db.session.commit()
            r = make_response(redirect(url_for('board'))); r.set_cookie('ws_id', str(w.id)); return r
        my = Workspace.query.join(WorkspaceMember, Workspace.id==WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id==current_user.id).all()
        return render_template('workspaces.html', items=my)

    @app.route('/join/<code>')
    @login_required
    def join_link(code):
        w = Workspace.query.filter_by(invite_code=code).first_or_404()
        if not WorkspaceMember.query.filter_by(workspace_id=w.id, user_id=current_user.id).first():
            db.session.add(WorkspaceMember(workspace_id=w.id, user_id=current_user.id, role='member')); db.session.commit()
        r = make_response(redirect(url_for('board'))); r.set_cookie('ws_id', str(w.id)); return r

    @app.route('/workspace/<int:wid>/set')
    @login_required
    def set_workspace(wid):
        require_member(wid)
        r = make_response(redirect(url_for('board')))
        r.set_cookie('ws_id', str(wid))
        return r

    @app.route('/members', methods=['GET', 'POST'])
    @login_required
    def members():
        wid = ws_id(); me = require_member(wid)
        if request.method == 'POST':
            if me.role != 'admin': abort(403)
            if request.form['action'] == 'invite_email':
                email = request.form['email'].strip().lower(); u = User.query.filter_by(email=email).first()
                if u and not WorkspaceMember.query.filter_by(workspace_id=wid, user_id=u.id).first():
                    db.session.add(WorkspaceMember(workspace_id=wid, user_id=u.id, role='member'))
            elif request.form['action'] == 'set_role':
                m = db.session.get(WorkspaceMember, int(request.form['member_id']));
                if m and m.workspace_id == wid: m.role = request.form['role']
            elif request.form['action'] == 'remove':
                m = db.session.get(WorkspaceMember, int(request.form['member_id']))
                if m and m.workspace_id == wid and m.user_id != current_user.id: db.session.delete(m)
            db.session.commit(); return redirect(url_for('members'))
        rows = WorkspaceMember.query.filter_by(workspace_id=wid).all(); users = {u.id:u for u in User.query.all()}
        workload = {}
        for m in rows:
            workload[m.user_id] = {s: Task.query.filter_by(workspace_id=wid, assignee_id=m.user_id, status=s).count() for s in STATUSES}
        invite = Workspace.query.get(wid).invite_code
        return render_template('members.html', rows=rows, users=users, me=me, workload=workload, invite=invite)

    @app.route('/activity')
    @login_required
    def activity_feed():
        wid = ws_id(); require_member(wid)
        task_ids = [t.id for t in Task.query.filter_by(workspace_id=wid).all()]
        rows = Activity.query.filter(Activity.task_id.in_(task_ids)).order_by(Activity.id.desc()).limit(200).all() if task_ids else []
        users = {u.id:u for u in User.query.all()}
        return render_template('activity.html', rows=rows, users=users)

    @app.route('/board')
    @login_required
    def board():
        wid = ws_id()
        if wid == 0: return redirect(url_for('workspaces'))
        require_member(wid)
        users = member_users(wid)
        return render_template('board.html', users=users)

    @app.route('/api/board')
    @login_required
    def api_board():
        wid = ws_id(); require_member(wid)
        q = request.args.get('q','').strip().lower()
        tasks = Task.query.filter_by(workspace_id=wid).all()
        comments_count = {t.id: Comment.query.filter_by(task_id=t.id).count() for t in tasks}
        users = {u.id:u for u in User.query.all()}
        payload = {s: [] for s in STATUSES}
        for t in tasks:
            if q and q not in (t.title + ' ' + (t.description or '')).lower():
                continue
            payload[t.status].append({
                'id': t.id,'title': t.title,'priority': t.priority,'due_date': str(t.due_date) if t.due_date else '',
                'overdue': bool(t.due_date and t.due_date < date.today() and t.status != 'done'),
                'assignee': users[t.assignee_id].email if t.assignee_id in users else 'Unassigned',
                'avatar': users[t.assignee_id].avatar if t.assignee_id in users else '👤',
                'comments': comments_count[t.id]
            })
        return jsonify(payload)

    @app.route('/api/task', methods=['POST'])
    @login_required
    def api_task_create():
        wid = ws_id(); require_member(wid)
        d = request.get_json(force=True)
        due = datetime.strptime(d['due_date'], '%Y-%m-%d').date() if d.get('due_date') else None
        t = Task(workspace_id=wid, title=d['title'], description=d.get('description',''), priority=d.get('priority','medium'), due_date=due, assignee_id=d.get('assignee_id'), created_by=current_user.id)
        db.session.add(t); db.session.flush(); add_activity(t.id, 'create', '', t.title); notify(t.assignee_id, wid, f'Assigned: {t.title}'); db.session.commit()
        return jsonify({'ok': True, 'id': t.id})

    @app.route('/api/task/<int:tid>')
    @login_required
    def api_task_get(tid):
        t = db.session.get(Task, tid)
        if not t: abort(404)
        require_member(t.workspace_id)
        comments = Comment.query.filter_by(task_id=t.id).order_by(Comment.id.desc()).all()
        users = {u.id:u for u in User.query.all()}
        activity = Activity.query.filter_by(task_id=t.id).order_by(Activity.id.desc()).all()
        return jsonify({
            'task': {'id':t.id,'title':t.title,'description':t.description,'priority':t.priority,'status':t.status,'due_date':str(t.due_date) if t.due_date else '','assignee_id':t.assignee_id},
            'comments': [{'user':users[c.user_id].email,'avatar':users[c.user_id].avatar,'body':c.body,'at':str(c.created_at)} for c in comments],
            'activity': [{'field':a.field,'old':a.old_value,'new':a.new_value,'at':str(a.created_at)} for a in activity]
        })

    @app.route('/api/task/<int:tid>/update', methods=['POST'])
    @login_required
    def api_task_update(tid):
        t = db.session.get(Task, tid)
        if not t: abort(404)
        require_member(t.workspace_id)
        d = request.get_json(force=True)
        for f in ['title','description','priority','status','assignee_id','due_date']:
            if f in d:
                old = getattr(t, f)
                new = d[f]
                if f == 'due_date' and new: new = datetime.strptime(new, '%Y-%m-%d').date()
                setattr(t, f, new)
                if str(old) != str(new): add_activity(t.id, f, old, new)
        t.updated_at = datetime.utcnow();
        if 'assignee_id' in d: notify(t.assignee_id, t.workspace_id, f'Assigned: {t.title}')
        db.session.commit(); return jsonify({'ok': True})

    @app.route('/api/task/<int:tid>/comment', methods=['POST'])
    @login_required
    def api_task_comment(tid):
        t = db.session.get(Task, tid)
        if not t: abort(404)
        require_member(t.workspace_id)
        body = request.get_json(force=True).get('body','').strip()
        if body:
            db.session.add(Comment(task_id=t.id, user_id=current_user.id, body=body))
            add_activity(t.id, 'comment', '', body[:60]); notify(t.assignee_id, t.workspace_id, f'Comment on: {t.title}')
            db.session.commit()
        return jsonify({'ok': True})

    @app.route('/api/members')
    @login_required
    def api_members():
        wid = ws_id(); require_member(wid)
        users = member_users(wid)
        return jsonify([{'id':u.id,'email':u.email,'avatar':u.avatar} for u in users])

    @app.route('/api/workspaces')
    @login_required
    def api_workspaces():
        my = Workspace.query.join(WorkspaceMember, Workspace.id==WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id==current_user.id).all()
        active = ws_id()
        return jsonify([{'id':w.id,'name':w.name,'active':w.id==active} for w in my])

    @app.route('/api/presence')
    @login_required
    def api_presence():
        wid = ws_id(); require_member(wid)
        users = member_users(wid)
        return jsonify([{'email':u.email,'avatar':u.avatar,'online':True} for u in users])

    @app.route('/api/profile')
    @login_required
    def api_profile():
        return jsonify({'email': current_user.email, 'avatar': current_user.avatar})

    @app.route('/api/notifications')
    @login_required
    def api_notifications():
        rows = Notification.query.filter_by(recipient_id=current_user.id).order_by(Notification.id.desc()).limit(50).all()
        return jsonify([{'id':n.id,'message':n.message,'read':n.is_read,'at':str(n.created_at)} for n in rows])

    @app.route('/api/notifications/read', methods=['POST'])
    @login_required
    def api_notifications_read():
        Notification.query.filter_by(recipient_id=current_user.id, is_read=False).update({'is_read': True})
        db.session.commit(); return jsonify({'ok': True})
