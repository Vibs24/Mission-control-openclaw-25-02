import os, sqlite3
from datetime import datetime
from functools import wraps
from flask import Flask, g, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE, 'instance', 'teamflow.db')


def create_app(test_config=None):
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'change-in-production'
    app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 30
    if test_config:
        app.config.update(test_config)

    def get_db():
        if 'db' not in g:
            path = app.config.get('DATABASE', DB_PATH)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            g.db = sqlite3.connect(path)
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys = ON')
        return g.db

    def close_db(_=None):
        db = g.pop('db', None)
        if db:
            db.close()

    app.teardown_appcontext(close_db)

    def init_db():
        db = sqlite3.connect(app.config.get('DATABASE', DB_PATH))
        db.executescript(open(os.path.join(BASE, 'schema.sql')).read())
        db.commit()
        db.close()

    app.init_db = init_db

    def login_required(f):
        @wraps(f)
        def w(*args, **kwargs):
            if 'user_id' not in session:
                return redirect(url_for('login'))
            return f(*args, **kwargs)
        return w

    def current_user():
        if 'user_id' not in session:
            return None
        return get_db().execute('SELECT * FROM users WHERE id=?', (session['user_id'],)).fetchone()

    def user_workspace_ids(user_id):
        rows = get_db().execute('SELECT workspace_id FROM memberships WHERE user_id=?', (user_id,)).fetchall()
        return {r['workspace_id'] for r in rows}

    def log_history(task_id, actor_id, action, payload=''):
        get_db().execute('INSERT INTO task_history(task_id,actor_id,action,payload,created_at) VALUES (?,?,?,?,?)',
                         (task_id, actor_id, action, payload, datetime.utcnow().isoformat()))

    def notify(user_id, msg):
        get_db().execute('INSERT INTO notifications(user_id,message,created_at,is_read) VALUES (?,?,?,0)',
                         (user_id, msg, datetime.utcnow().isoformat()))

    @app.route('/')
    def home():
        if 'user_id' in session:
            return redirect(url_for('workspaces'))
        return render_template('home.html')

    @app.route('/signup', methods=['GET', 'POST'])
    def signup():
        if request.method == 'POST':
            email = request.form['email'].strip().lower()
            pw = request.form['password']
            db = get_db()
            if db.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
                flash('Email already exists', 'danger')
            else:
                db.execute('INSERT INTO users(email,password_hash,created_at) VALUES (?,?,?)',
                           (email, generate_password_hash(pw), datetime.utcnow().isoformat()))
                db.commit()
                flash('Account created. Please login.', 'success')
                return redirect(url_for('login'))
        return render_template('signup.html')

    @app.route('/login', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            email = request.form['email'].strip().lower()
            pw = request.form['password']
            u = get_db().execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
            if u and check_password_hash(u['password_hash'], pw):
                session.clear()
                session.permanent = True
                session['user_id'] = u['id']
                return redirect(url_for('workspaces'))
            flash('Invalid credentials', 'danger')
        return render_template('login.html')

    @app.route('/logout')
    def logout():
        session.clear()
        return redirect(url_for('home'))

    @app.route('/workspaces', methods=['GET', 'POST'])
    @login_required
    def workspaces():
        db = get_db(); u = current_user()
        if request.method == 'POST':
            name = request.form['name'].strip()
            cur = db.execute('INSERT INTO workspaces(name,owner_id,created_at) VALUES (?,?,?)', (name, u['id'], datetime.utcnow().isoformat()))
            wid = cur.lastrowid
            db.execute('INSERT INTO memberships(workspace_id,user_id,role) VALUES (?,?,?)', (wid, u['id'], 'admin'))
            db.commit()
            return redirect(url_for('board', workspace_id=wid))
        rows = db.execute('''SELECT w.* FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.id DESC''', (u['id'],)).fetchall()
        return render_template('workspaces.html', workspaces=rows)

    @app.route('/workspace/<int:workspace_id>/invite', methods=['POST'])
    @login_required
    def invite(workspace_id):
        db = get_db(); u = current_user()
        m = db.execute('SELECT role FROM memberships WHERE workspace_id=? AND user_id=?', (workspace_id, u['id'])).fetchone()
        if not m or m['role'] != 'admin':
            return 'Forbidden', 403
        email = request.form['email'].strip().lower()
        role = request.form.get('role', 'member')
        invited = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
        if not invited:
            flash('User must sign up first', 'warning'); return redirect(url_for('members', workspace_id=workspace_id))
        if not db.execute('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=?', (workspace_id, invited['id'])).fetchone():
            db.execute('INSERT INTO memberships(workspace_id,user_id,role) VALUES (?,?,?)', (workspace_id, invited['id'], role))
            db.commit()
        return redirect(url_for('members', workspace_id=workspace_id))

    @app.route('/workspace/<int:workspace_id>/members')
    @login_required
    def members(workspace_id):
        db=get_db(); u=current_user()
        if workspace_id not in user_workspace_ids(u['id']): return 'Forbidden',403
        role_row = db.execute('SELECT role FROM memberships WHERE workspace_id=? AND user_id=?', (workspace_id,u['id'])).fetchone()
        rows = db.execute('''SELECT u.id,u.email,m.role,
            (SELECT COUNT(*) FROM tasks t WHERE t.workspace_id=m.workspace_id AND t.assignee_id=u.id AND t.status IN ('todo','doing')) AS in_progress
            FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.email''',(workspace_id,)).fetchall()
        return render_template('members.html', rows=rows, workspace_id=workspace_id, my_role=role_row['role'])

    @app.post('/workspace/<int:workspace_id>/members/<int:user_id>/remove')
    @login_required
    def remove_member(workspace_id,user_id):
        db=get_db(); u=current_user()
        r=db.execute('SELECT role FROM memberships WHERE workspace_id=? AND user_id=?',(workspace_id,u['id'])).fetchone()
        if not r or r['role']!='admin': return 'Forbidden',403
        db.execute('DELETE FROM memberships WHERE workspace_id=? AND user_id=?',(workspace_id,user_id)); db.commit()
        return redirect(url_for('members',workspace_id=workspace_id))

    @app.route('/workspace/<int:workspace_id>/board')
    @login_required
    def board(workspace_id):
        db=get_db(); u=current_user()
        if workspace_id not in user_workspace_ids(u['id']): return 'Forbidden',403
        q = request.args.get('q','').strip(); priority=request.args.get('priority',''); assignee=request.args.get('assignee','')
        where=['t.workspace_id=?']; params=[workspace_id]
        if q: where.append('(t.title LIKE ? OR t.description LIKE ?)'); params += [f'%{q}%', f'%{q}%']
        if priority: where.append('t.priority=?'); params.append(priority)
        if assignee: where.append('t.assignee_id=?'); params.append(int(assignee))
        page=max(1,int(request.args.get('page',1))); per_page=20; off=(page-1)*per_page
        sql=f'''SELECT t.*,u.email assignee_email FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
               WHERE {' AND '.join(where)} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?'''
        tasks=db.execute(sql,(*params,per_page,off)).fetchall()
        members=db.execute('''SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.email''',(workspace_id,)).fetchall()
        notifs=db.execute('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 20',(u['id'],)).fetchall()
        return render_template('board.html', tasks=tasks, workspace_id=workspace_id, members=members, q=q, priority=priority, assignee=assignee, notifs=notifs)

    @app.post('/workspace/<int:workspace_id>/task/new')
    @login_required
    def task_new(workspace_id):
        db=get_db(); u=current_user()
        if workspace_id not in user_workspace_ids(u['id']): return 'Forbidden',403
        title=request.form['title']; desc=request.form.get('description',''); due=request.form.get('due_date') or None
        pr=request.form.get('priority','medium'); assignee=int(request.form['assignee_id']) if request.form.get('assignee_id') else None
        cur=db.execute('''INSERT INTO tasks(workspace_id,title,description,due_date,priority,status,assignee_id,creator_id,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)''',(workspace_id,title,desc,due,pr,'todo',assignee,u['id'],datetime.utcnow().isoformat(),datetime.utcnow().isoformat()))
        tid=cur.lastrowid
        log_history(tid,u['id'],'create',title)
        if assignee and assignee!=u['id']:
            notify(assignee, f'You were assigned task: {title}')
        db.commit(); return redirect(url_for('board',workspace_id=workspace_id))

    @app.post('/task/<int:task_id>/move')
    @login_required
    def task_move(task_id):
        db=get_db(); u=current_user(); data=request.get_json(force=True)
        status=data.get('status')
        t=db.execute('SELECT * FROM tasks WHERE id=?',(task_id,)).fetchone()
        if not t or t['workspace_id'] not in user_workspace_ids(u['id']): return jsonify({'ok':False}),403
        db.execute('UPDATE tasks SET status=?, updated_at=? WHERE id=?',(status,datetime.utcnow().isoformat(),task_id))
        log_history(task_id,u['id'],'status',status); db.commit(); return jsonify({'ok':True})

    @app.route('/task/<int:task_id>', methods=['GET','POST'])
    @login_required
    def task_detail(task_id):
        db=get_db(); u=current_user()
        t=db.execute('''SELECT t.*,u.email assignee_email FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?''',(task_id,)).fetchone()
        if not t or t['workspace_id'] not in user_workspace_ids(u['id']): return 'Forbidden',403
        if request.method=='POST':
            comment=request.form.get('comment','').strip(); note=request.form.get('note','').strip()
            if comment:
                db.execute('INSERT INTO comments(task_id,user_id,content,created_at) VALUES (?,?,?,?)',(task_id,u['id'],comment,datetime.utcnow().isoformat()))
                log_history(task_id,u['id'],'comment',comment[:120])
                if t['assignee_id'] and t['assignee_id']!=u['id']:
                    notify(t['assignee_id'], f'New comment on task: {t["title"]}')
            if note:
                db.execute('INSERT INTO notes(task_id,user_id,content,created_at) VALUES (?,?,?,?)',(task_id,u['id'],note,datetime.utcnow().isoformat()))
                log_history(task_id,u['id'],'note',note[:120])
            db.commit(); return redirect(url_for('task_detail',task_id=task_id))
        comments=db.execute('''SELECT c.*,u.email FROM comments c JOIN users u ON u.id=c.user_id WHERE c.task_id=? ORDER BY c.id DESC''',(task_id,)).fetchall()
        notes=db.execute('''SELECT n.*,u.email FROM notes n JOIN users u ON u.id=n.user_id WHERE n.task_id=? ORDER BY n.id DESC''',(task_id,)).fetchall()
        hist=db.execute('''SELECT h.*,u.email FROM task_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.task_id=? ORDER BY h.id DESC''',(task_id,)).fetchall()
        return render_template('task_detail.html', task=t, comments=comments, notes=notes, history=hist)

    @app.route('/workspace/<int:workspace_id>/export/workload.csv')
    @login_required
    def export_workload(workspace_id):
        db=get_db(); u=current_user()
        if workspace_id not in user_workspace_ids(u['id']): return 'Forbidden',403
        rows=db.execute('''SELECT u.email,
            SUM(CASE WHEN t.status='todo' THEN 1 ELSE 0 END) todo,
            SUM(CASE WHEN t.status='doing' THEN 1 ELSE 0 END) doing,
            SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) done
            FROM memberships m JOIN users u ON u.id=m.user_id
            LEFT JOIN tasks t ON t.assignee_id=u.id AND t.workspace_id=m.workspace_id
            WHERE m.workspace_id=? GROUP BY u.email ORDER BY u.email''',(workspace_id,)).fetchall()
        lines=['email,todo,doing,done']+[f"{r['email']},{r['todo'] or 0},{r['doing'] or 0},{r['done'] or 0}" for r in rows]
        return ('\n'.join(lines),200,{'Content-Type':'text/csv','Content-Disposition':'attachment; filename=workload.csv'})

    @app.route('/workspace/<int:workspace_id>/export/summary.pdf')
    @login_required
    def export_pdf(workspace_id):
        db=get_db(); u=current_user()
        if workspace_id not in user_workspace_ids(u['id']): return 'Forbidden',403
        body=f"Workload Summary Workspace {workspace_id} generated {datetime.utcnow().isoformat()}"
        pdf=(b'%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length '+str(len(body)+40).encode()+b'>>stream\nBT /F1 12 Tf 10 180 Td ('+body.encode().replace(b'(',b'[').replace(b')',b']')+b') Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000120 00000 n \n0000000250 00000 n \n0000000400 00000 n \ntrailer<</Root 1 0 R/Size 6>>\nstartxref\n470\n%%EOF')
        return (pdf,200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename=summary.pdf'})

    with app.app_context():
        app.init_db()
    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
