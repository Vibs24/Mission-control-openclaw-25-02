from datetime import datetime
from flask import render_template, request, redirect, url_for, flash, abort
from flask_login import login_user, logout_user, login_required, current_user
from .models import db, User, Workspace, WorkspaceMember, Task, Comment, TaskHistory, Notification

def in_workspace(ws_id):
    return WorkspaceMember.query.filter_by(workspace_id=ws_id, user_id=current_user.id).first() is not None

def register_routes(app):
    @app.route('/')
    def root():
        return redirect(url_for('board')) if current_user.is_authenticated else redirect(url_for('login'))

    @app.route('/signup', methods=['GET','POST'])
    def signup():
        if request.method=='POST':
            u=User(email=request.form['email'].strip().lower()); u.set_password(request.form['password'])
            db.session.add(u); db.session.commit(); login_user(u, remember=True)
            return redirect(url_for('workspaces'))
        return render_template('signup.html')

    @app.route('/login', methods=['GET','POST'])
    def login():
        if request.method=='POST':
            u=User.query.filter_by(email=request.form['email'].strip().lower()).first()
            if u and u.check_password(request.form['password']):
                login_user(u, remember=True); return redirect(url_for('workspaces'))
            flash('Invalid credentials','danger')
        return render_template('login.html')

    @app.route('/logout')
    @login_required
    def logout():
        logout_user(); return redirect(url_for('login'))

    @app.route('/workspaces', methods=['GET','POST'])
    @login_required
    def workspaces():
        if request.method=='POST':
            ws=Workspace(name=request.form['name'], owner_id=current_user.id); db.session.add(ws); db.session.flush()
            db.session.add(WorkspaceMember(workspace_id=ws.id,user_id=current_user.id,role='admin')); db.session.commit()
            return redirect(url_for('set_workspace', ws_id=ws.id))
        rows = Workspace.query.join(WorkspaceMember, Workspace.id==WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id==current_user.id).all()
        return render_template('workspaces.html', rows=rows)

    @app.route('/workspace/<int:ws_id>/set')
    @login_required
    def set_workspace(ws_id):
        if not in_workspace(ws_id): abort(403)
        resp = redirect(url_for('board', ws_id=ws_id)); resp.set_cookie('ws_id', str(ws_id)); return resp

    @app.route('/workspace/members', methods=['GET','POST'])
    @login_required
    def members():
        ws_id=int(request.cookies.get('ws_id','0'))
        mem = WorkspaceMember.query.filter_by(workspace_id=ws_id,user_id=current_user.id).first()
        if not mem: return redirect(url_for('workspaces'))
        if request.method=='POST':
            if mem.role!='admin': abort(403)
            email=request.form['email'].strip().lower(); user=User.query.filter_by(email=email).first()
            if user and not WorkspaceMember.query.filter_by(workspace_id=ws_id,user_id=user.id).first():
                db.session.add(WorkspaceMember(workspace_id=ws_id,user_id=user.id,role='member')); db.session.commit()
            return redirect(url_for('members'))
        rows=WorkspaceMember.query.filter_by(workspace_id=ws_id).all()
        return render_template('members.html', rows=rows, users={u.id:u for u in User.query.all()}, admin=(mem.role=='admin'))

    @app.route('/workspace/member/<int:mid>/remove', methods=['POST'])
    @login_required
    def remove_member(mid):
        ws_id=int(request.cookies.get('ws_id','0'))
        mem = WorkspaceMember.query.filter_by(workspace_id=ws_id,user_id=current_user.id,role='admin').first()
        if not mem: abort(403)
        target=db.session.get(WorkspaceMember, mid)
        if target and target.workspace_id==ws_id and target.user_id!=current_user.id:
            db.session.delete(target); db.session.commit()
        return redirect(url_for('members'))

    @app.route('/board', methods=['GET','POST'])
    @login_required
    def board():
        ws_id=int(request.args.get('ws_id', request.cookies.get('ws_id','0')))
        if ws_id and not in_workspace(ws_id): abort(403)
        if ws_id==0: return redirect(url_for('workspaces'))
        q=request.args.get('q','').strip(); assignee=request.args.get('assignee','')
        query=Task.query.filter_by(workspace_id=ws_id)
        if q: query=query.filter(Task.title.ilike(f'%{q}%'))
        if assignee: query=query.filter_by(assignee_id=int(assignee))
        if request.method=='POST':
            due = datetime.strptime(request.form['due_date'],'%Y-%m-%d').date() if request.form.get('due_date') else None
            t=Task(workspace_id=ws_id,title=request.form['title'],description=request.form.get('description',''),due_date=due,priority=request.form.get('priority','medium'),assignee_id=int(request.form['assignee_id']),created_by=current_user.id)
            db.session.add(t); db.session.flush(); db.session.add(TaskHistory(task_id=t.id, action='task.create', detail=t.title))
            if t.assignee_id!=current_user.id: db.session.add(Notification(user_id=t.assignee_id, message=f'You were assigned task: {t.title}'))
            db.session.commit(); return redirect(url_for('board'))
        tasks=query.all(); users=User.query.all(); members=[m.user_id for m in WorkspaceMember.query.filter_by(workspace_id=ws_id).all()]
        users=[u for u in users if u.id in members]
        cols={s:[t for t in tasks if t.status==s] for s in ['todo','in_progress','done']}
        return render_template('board.html', cols=cols, users=users, q=q, assignee=assignee)

    @app.route('/task/<int:tid>', methods=['GET','POST'])
    @login_required
    def task_detail(tid):
        t=db.session.get(Task, tid)
        if not t or not in_workspace(t.workspace_id): abort(404)
        if request.method=='POST':
            if 'comment' in request.form:
                c=Comment(task_id=t.id,user_id=current_user.id,body=request.form['comment']); db.session.add(c)
                db.session.add(TaskHistory(task_id=t.id, action='comment.add', detail='comment posted'))
                if t.assignee_id and t.assignee_id!=current_user.id: db.session.add(Notification(user_id=t.assignee_id, message=f'New comment on task: {t.title}'))
            else:
                old=t.status; t.status=request.form['status']; db.session.add(TaskHistory(task_id=t.id, action='status.change', detail=f'{old}->{t.status}'))
            db.session.commit(); return redirect(url_for('task_detail', tid=t.id))
        comments=Comment.query.filter_by(task_id=t.id).order_by(Comment.id.desc()).all()
        history=TaskHistory.query.filter_by(task_id=t.id).order_by(TaskHistory.id.desc()).all()
        return render_template('task.html', t=t, comments=comments, history=history)

    @app.route('/notifications')
    @login_required
    def notifications():
        rows=Notification.query.filter_by(user_id=current_user.id).order_by(Notification.id.desc()).all()
        return render_template('notifications.html', rows=rows)

    @app.route('/admin/overview')
    @login_required
    def overview():
        ws_id=int(request.cookies.get('ws_id','0'))
        mem=WorkspaceMember.query.filter_by(workspace_id=ws_id,user_id=current_user.id,role='admin').first()
        if not mem: abort(403)
        members=WorkspaceMember.query.filter_by(workspace_id=ws_id).all()
        data=[]
        for m in members:
            user=db.session.get(User,m.user_id)
            data.append((user.email, Task.query.filter_by(workspace_id=ws_id,assignee_id=user.id,status='in_progress').count()))
        return render_template('overview.html', data=data)
