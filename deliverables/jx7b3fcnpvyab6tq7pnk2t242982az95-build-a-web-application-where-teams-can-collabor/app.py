import os, sqlite3
from functools import wraps
from flask import Flask, g, render_template, request, redirect, url_for, session, flash, jsonify

def create_app(test_config=None):
    app=Flask(__name__)
    app.config.update(SECRET_KEY='change-me', DATABASE=os.path.join(app.root_path,'collab.db'), PERMANENT_SESSION_LIFETIME=60*60*24*30)
    if test_config: app.config.update(test_config)

    def db():
        if 'db' not in g:
            g.db=sqlite3.connect(app.config['DATABASE']); g.db.row_factory=sqlite3.Row
        return g.db
    @app.teardown_appcontext
    def close(_=None):
        c=g.pop('db',None)
        if c: c.close()

    def init_db():
        with open(os.path.join(app.root_path,'schema.sql')) as f: db().executescript(f.read())
        db().commit()

    def auth(fn):
        @wraps(fn)
        def w(*a,**k):
            if not session.get('uid'): return redirect(url_for('login'))
            session.permanent=True
            return fn(*a,**k)
        return w

    def current_workspace_id():
        return session.get('wid')

    def notify(user_id,msg):
        db().execute('INSERT INTO notifications(user_id,message) VALUES(?,?)',(user_id,msg)); db().commit()

    @app.route('/signup',methods=['GET','POST'])
    def signup():
        if request.method=='POST':
            d=request.form
            try:
                db().execute('INSERT INTO users(email,password,name) VALUES(?,?,?)',(d['email'].lower(),d['password'],d['name']))
                db().commit(); flash('Signup successful. Please login.','ok'); return redirect(url_for('login'))
            except sqlite3.IntegrityError: flash('Email already exists','error')
        return render_template('signup.html')

    @app.route('/login',methods=['GET','POST'])
    def login():
        if request.method=='POST':
            u=db().execute('SELECT * FROM users WHERE email=? AND password=?',(request.form['email'].lower(),request.form['password'])).fetchone()
            if u:
                session.clear(); session['uid']=u['id']; session['name']=u['name']
                m=db().execute('SELECT workspace_id FROM memberships WHERE user_id=? ORDER BY id LIMIT 1',(u['id'],)).fetchone()
                if m: session['wid']=m['workspace_id']
                return redirect(url_for('board'))
            flash('Invalid credentials','error')
        return render_template('login.html')

    @app.route('/logout')
    def logout(): session.clear(); return redirect(url_for('login'))

    @app.route('/workspace/new',methods=['GET','POST'])
    @auth
    def workspace_new():
        if request.method=='POST':
            name=request.form['name']
            db().execute('INSERT INTO workspaces(name,owner_id) VALUES(?,?)',(name,session['uid']))
            wid=db().execute('SELECT last_insert_rowid() id').fetchone()['id']
            db().execute("INSERT INTO memberships(workspace_id,user_id,role) VALUES(?,?,'admin')",(wid,session['uid']))
            db().commit(); session['wid']=wid
            return redirect(url_for('board'))
        return render_template('workspace_new.html')

    @app.route('/')
    @auth
    def board():
        if not current_workspace_id(): return redirect(url_for('workspace_new'))
        wid=current_workspace_id()
        tasks=db().execute('SELECT t.*, u.name assignee_name FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id WHERE workspace_id=? ORDER BY id DESC',(wid,)).fetchall()
        members=db().execute('SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?',(wid,)).fetchall()
        notifs=db().execute('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 10',(session['uid'],)).fetchall()
        return render_template('board.html',tasks=tasks,members=members,notifs=notifs)

    @app.route('/invite',methods=['POST'])
    @auth
    def invite():
        wid=current_workspace_id(); email=request.form['email'].lower()
        db().execute('INSERT INTO invites(workspace_id,email,invited_by) VALUES(?,?,?)',(wid,email,session['uid']))
        u=db().execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()
        if u:
            db().execute("INSERT OR IGNORE INTO memberships(workspace_id,user_id,role) VALUES(?,?,'member')",(wid,u['id']))
            notify(u['id'],f"You were invited to workspace #{wid}")
        db().commit(); return redirect(url_for('board'))

    @app.route('/members/remove/<int:user_id>',methods=['POST'])
    @auth
    def remove_member(user_id):
        wid=current_workspace_id()
        role=db().execute('SELECT role FROM memberships WHERE workspace_id=? AND user_id=?',(wid,session['uid'])).fetchone()
        if not role or role['role']!='admin': flash('Admin only','error'); return redirect(url_for('board'))
        db().execute('DELETE FROM memberships WHERE workspace_id=? AND user_id=?',(wid,user_id)); db().commit()
        return redirect(url_for('board'))

    @app.route('/task/new',methods=['POST'])
    @auth
    def task_new():
        d=request.form; wid=current_workspace_id()
        db().execute('INSERT INTO tasks(workspace_id,title,description,due_date,priority,status,assignee_id,created_by) VALUES(?,?,?,?,?,?,?,?)',
            (wid,d['title'],d.get('description',''),d.get('due_date',''),d.get('priority','medium'),'todo',int(d['assignee_id']) if d.get('assignee_id') else None,session['uid']))
        tid=db().execute('SELECT last_insert_rowid() id').fetchone()['id']
        db().execute('INSERT INTO task_history(task_id,actor_id,event) VALUES(?,?,?)',(tid,session['uid'],'created task'))
        if d.get('assignee_id'):
            notify(int(d['assignee_id']),f"You were assigned task: {d['title']}")
        db().commit(); return redirect(url_for('board'))

    @app.route('/task/<int:task_id>')
    @auth
    def task_detail(task_id):
        t=db().execute('SELECT t.*,u.name assignee_name FROM tasks t LEFT JOIN users u ON t.assignee_id=u.id WHERE t.id=?',(task_id,)).fetchone()
        comments=db().execute('SELECT c.*,u.name FROM comments c JOIN users u ON c.user_id=u.id WHERE task_id=? ORDER BY c.id DESC',(task_id,)).fetchall()
        hist=db().execute('SELECT h.*,u.name FROM task_history h JOIN users u ON h.actor_id=u.id WHERE task_id=? ORDER BY h.id DESC',(task_id,)).fetchall()
        return render_template('task_detail.html',t=t,comments=comments,hist=hist)

    @app.route('/task/<int:task_id>/comment',methods=['POST'])
    @auth
    def add_comment(task_id):
        body=request.form['body']
        db().execute('INSERT INTO comments(task_id,user_id,body) VALUES(?,?,?)',(task_id,session['uid'],body))
        db().execute('INSERT INTO task_history(task_id,actor_id,event) VALUES(?,?,?)',(task_id,session['uid'],'commented'))
        t=db().execute('SELECT assignee_id,title FROM tasks WHERE id=?',(task_id,)).fetchone()
        if t and t['assignee_id'] and t['assignee_id']!=session['uid']:
            notify(t['assignee_id'],f"New comment on your task: {t['title']}")
        db().commit(); return redirect(url_for('task_detail',task_id=task_id))

    @app.post('/task/<int:task_id>/move')
    @auth
    def move_task(task_id):
        status=request.json.get('status')
        if status not in {'todo','in_progress','done'}: return jsonify({'ok':False}),400
        db().execute('UPDATE tasks SET status=? WHERE id=?',(status,task_id))
        db().execute('INSERT INTO task_history(task_id,actor_id,event) VALUES(?,?,?)',(task_id,session['uid'],f'moved to {status}'))
        db().commit(); return jsonify({'ok':True})

    @app.route('/admin/overview')
    @auth
    def admin_overview():
        wid=current_workspace_id()
        role=db().execute('SELECT role FROM memberships WHERE workspace_id=? AND user_id=?',(wid,session['uid'])).fetchone()
        if not role or role['role']!='admin': flash('Admin only','error'); return redirect(url_for('board'))
        rows=db().execute("SELECT u.name, SUM(CASE WHEN t.status='in_progress' THEN 1 ELSE 0 END) in_progress, COUNT(t.id) total FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN tasks t ON t.assignee_id=u.id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=? GROUP BY u.id ORDER BY total DESC",(wid,)).fetchall()
        return render_template('overview.html',rows=rows)

    app.init_db=init_db
    return app

app=create_app()
if __name__=='__main__': app.run(debug=True)
