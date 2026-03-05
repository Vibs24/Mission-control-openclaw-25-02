import csv, io, os, sqlite3
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, g, Response, send_file
from reportlab.pdfgen import canvas

ROLE_RANK={"reviewer":1,"manager":2,"admin":3}

def create_app(test_config=None):
    app=Flask(__name__)
    app.config.update(SECRET_KEY='change-me', DATABASE=os.path.join(app.root_path,'workforce.db'), PAGE_SIZE=10)
    if test_config: app.config.update(test_config)

    def get_db():
        if 'db' not in g:
            g.db=sqlite3.connect(app.config['DATABASE']); g.db.row_factory=sqlite3.Row
        return g.db
    @app.teardown_appcontext
    def close_db(_=None):
        db=g.pop('db',None)
        if db: db.close()

    def log(action, entity, entity_id=None, details=''):
        get_db().execute("INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)",(session.get('user_id'),action,entity,entity_id,details)); get_db().commit()

    def require(min_role='reviewer'):
        def dec(fn):
            @wraps(fn)
            def wrap(*a,**k):
                if not session.get('user_id'): return redirect(url_for('login'))
                if ROLE_RANK[session['role']]<ROLE_RANK[min_role]:
                    flash('Insufficient permissions','error'); return redirect(url_for('dashboard'))
                return fn(*a,**k)
            return wrap
        return dec

    def paginate(base, params=()):
        page=max(int(request.args.get('page',1)),1); size=app.config['PAGE_SIZE']
        rows=get_db().execute(base+" LIMIT ? OFFSET ?",(*params,size,(page-1)*size)).fetchall()
        total=get_db().execute(f"SELECT COUNT(*) c FROM ({base})",params).fetchone()['c']
        return rows,page,max(1,(total+size-1)//size)

    @app.cli.command('init-db')
    def init_db_cmd():
        with open(os.path.join(app.root_path,'schema.sql')) as f: get_db().executescript(f.read())
        get_db().commit(); print('initialized')

    def init_db():
        with open(os.path.join(app.root_path,'schema.sql')) as f: get_db().executescript(f.read())
        get_db().commit()

    def seed_data():
        db=get_db()
        if db.execute('SELECT COUNT(*) c FROM users').fetchone()['c']>0: return
        db.executemany('INSERT INTO departments(name) VALUES(?)',[('Operations',),('Sales',),('Finance',)])
        db.executemany('INSERT INTO users(username,password,role,department_id) VALUES(?,?,?,?)',[
            ('admin','admin123','admin',1),('manager1','manager123','manager',1),('reviewer1','reviewer123','reviewer',2)])
        db.executemany('INSERT INTO employees(emp_code,name,email,phone,department_id,title,salary,status) VALUES(?,?,?,?,?,?,?,?)',[
            ('E100','Anita Rao','anita@corp.com','90001',1,'Ops Lead',65000,'active'),('E101','Karan Iyer','karan@corp.com','90002',2,'Sales Exec',42000,'active')])
        db.execute("INSERT INTO shifts(employee_id,shift_date,start_time,end_time,status) VALUES(1,date('now'),'09:00','17:00','planned')")
        db.execute("INSERT INTO attendance(employee_id,day,check_in,check_out,hours,status) VALUES(1,date('now'),'09:03','17:02',7.98,'present')")
        db.execute("INSERT INTO leaves(employee_id,leave_type,start_date,end_date,reason,status) VALUES(2,'annual',date('now','+2 day'),date('now','+4 day'),'family event','pending')")
        db.commit()

    @app.route('/')
    def home(): return redirect(url_for('dashboard')) if session.get('user_id') else redirect(url_for('login'))

    @app.route('/login', methods=['GET','POST'])
    def login():
        if request.method=='POST':
            u=get_db().execute('SELECT * FROM users WHERE username=? AND password=?',(request.form['username'],request.form['password'])).fetchone()
            if u:
                session.clear(); session.update({'user_id':u['id'],'username':u['username'],'role':u['role'],'department_id':u['department_id']}); log('login','auth',u['id'],'login'); return redirect(url_for('dashboard'))
            flash('Invalid credentials','error')
        return render_template('login.html')

    @app.route('/logout')
    def logout():
        if session.get('user_id'): log('logout','auth',session['user_id'],'logout')
        session.clear(); return redirect(url_for('login'))

    @app.route('/dashboard')
    @require('reviewer')
    def dashboard():
        db=get_db(); p=db.execute("SELECT COALESCE(SUM(salary),0) v FROM employees WHERE status='active'").fetchone()['v']
        present=db.execute("SELECT COUNT(*) c FROM attendance WHERE day=date('now') AND status='present'").fetchone()['c']
        planned=db.execute("SELECT COUNT(*) c FROM shifts WHERE shift_date=date('now')").fetchone()['c']
        pending=db.execute("SELECT COUNT(*) c FROM leaves WHERE status='pending'").fetchone()['c']
        return render_template('dashboard.html', payroll=p,present=present,planned=planned,pending=pending)

    @app.route('/employees', methods=['GET','POST'])
    @require('manager')
    def employees():
        db=get_db()
        if request.method=='POST':
            d=request.form
            db.execute('INSERT INTO employees(emp_code,name,email,phone,department_id,title,salary,status) VALUES(?,?,?,?,?,?,?,?)',(d['emp_code'],d['name'],d.get('email',''),d.get('phone',''),int(d['department_id']),d.get('title',''),float(d.get('salary',0)),d.get('status','active')))
            db.commit(); log('create','employee',db.execute('SELECT last_insert_rowid() id').fetchone()['id'],d['name']); return redirect(url_for('employees'))
        q=request.args.get('q','').strip(); where=''; params=[]
        if q: where=' WHERE e.name LIKE ? OR e.emp_code LIKE ? OR e.email LIKE ?'; params=[f'%{q}%']*3
        base="SELECT e.*, d.name department FROM employees e JOIN departments d ON e.department_id=d.id"+where+" ORDER BY e.id DESC"
        rows,page,pages=paginate(base,tuple(params)); deps=db.execute('SELECT * FROM departments').fetchall()
        return render_template('employees.html', rows=rows, deps=deps, q=q, page=page, pages=pages)

    @app.route('/shifts', methods=['GET','POST'])
    @require('manager')
    def shifts():
        db=get_db()
        if request.method=='POST':
            d=request.form; db.execute('INSERT INTO shifts(employee_id,shift_date,start_time,end_time,status) VALUES(?,?,?,?,?)',(int(d['employee_id']),d['shift_date'],d['start_time'],d['end_time'],d.get('status','planned'))); db.commit(); log('create','shift',None,d['employee_id']); return redirect(url_for('shifts'))
        rows=db.execute('SELECT s.*, e.name employee FROM shifts s JOIN employees e ON s.employee_id=e.id ORDER BY s.id DESC LIMIT 200').fetchall(); emps=db.execute('SELECT id,name FROM employees WHERE status="active" ORDER BY name').fetchall()
        return render_template('shifts.html', rows=rows, emps=emps)

    @app.route('/attendance', methods=['GET','POST'])
    @require('reviewer')
    def attendance():
        db=get_db()
        if request.method=='POST':
            d=request.form
            db.execute('INSERT INTO attendance(employee_id,day,check_in,check_out,hours,status) VALUES(?,?,?,?,?,?)',(int(d['employee_id']),d['day'],d.get('check_in'),d.get('check_out'),float(d.get('hours',0)),d.get('status','present')))
            db.commit(); log('create','attendance',None,d['employee_id']); return redirect(url_for('attendance'))
        rows=db.execute('SELECT a.*, e.name employee FROM attendance a JOIN employees e ON a.employee_id=e.id ORDER BY a.id DESC LIMIT 200').fetchall(); emps=db.execute('SELECT id,name FROM employees ORDER BY name').fetchall()
        return render_template('attendance.html', rows=rows, emps=emps)

    @app.route('/leaves', methods=['GET','POST'])
    @require('reviewer')
    def leaves():
        db=get_db()
        if request.method=='POST':
            d=request.form
            db.execute('INSERT INTO leaves(employee_id,leave_type,start_date,end_date,reason,status) VALUES(?,?,?,?,?,?)',(int(d['employee_id']),d['leave_type'],d['start_date'],d['end_date'],d.get('reason',''),d.get('status','pending')))
            db.commit(); log('create','leave',None,d['employee_id']); return redirect(url_for('leaves'))
        rows=db.execute('SELECT l.*, e.name employee FROM leaves l JOIN employees e ON l.employee_id=e.id ORDER BY l.id DESC LIMIT 200').fetchall(); emps=db.execute('SELECT id,name FROM employees ORDER BY name').fetchall()
        return render_template('leaves.html', rows=rows, emps=emps)

    @app.post('/leaves/<int:leave_id>/review')
    @require('manager')
    def review_leave(leave_id):
        status=request.form.get('status','approved')
        get_db().execute('UPDATE leaves SET status=?, reviewed_by=? WHERE id=?',(status,session['user_id'],leave_id)); get_db().commit(); log('review','leave',leave_id,status)
        return redirect(url_for('leaves'))

    @app.route('/audit')
    @require('manager')
    def audit():
        rows=get_db().execute('SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id=u.id ORDER BY a.id DESC LIMIT 300').fetchall()
        return render_template('audit.html', rows=rows)

    @app.route('/export/payroll.csv')
    @require('manager')
    def payroll_csv():
        rows=get_db().execute("SELECT e.emp_code,e.name,d.name department,e.salary,COALESCE(SUM(a.hours),0) worked_hours FROM employees e JOIN departments d ON e.department_id=d.id LEFT JOIN attendance a ON a.employee_id=e.id GROUP BY e.id ORDER BY e.id").fetchall()
        out=io.StringIO(); w=csv.writer(out); w.writerow(['emp_code','name','department','salary','worked_hours'])
        for r in rows: w.writerow([r[k] for k in r.keys()])
        return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=payroll.csv'})

    @app.route('/export/<entity>.csv')
    @require('reviewer')
    def export_csv(entity):
        mp={'employees':'SELECT * FROM employees','shifts':'SELECT * FROM shifts','attendance':'SELECT * FROM attendance','leaves':'SELECT * FROM leaves','audit':'SELECT * FROM audit_logs'}
        if entity not in mp: return 'invalid',400
        rows=get_db().execute(mp[entity]).fetchall(); out=io.StringIO(); w=csv.writer(out)
        if rows:
            w.writerow(rows[0].keys())
            for r in rows: w.writerow([r[k] for k in r.keys()])
        return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':f'attachment; filename={entity}.csv'})

    @app.route('/export/payroll.pdf')
    @require('manager')
    def payroll_pdf():
        rows=get_db().execute('SELECT emp_code,name,salary FROM employees ORDER BY id').fetchall(); b=io.BytesIO(); c=canvas.Canvas(b); y=800
        c.drawString(72,y,'Payroll Summary'); y-=25
        for r in rows: c.drawString(72,y,f"{r['emp_code']} {r['name']} salary={r['salary']}"); y-=16
        c.save(); b.seek(0)
        return send_file(b,as_attachment=True,download_name='payroll.pdf',mimetype='application/pdf')

    @app.route('/api/health')
    def health():
        try:
            get_db().execute('SELECT 1').fetchone(); return {'status':'ok','db':'ok'}
        except Exception as e:
            return {'status':'fail','error':str(e)},500

    app.get_db=get_db; app.init_db=init_db; app.seed_data=seed_data
    return app

app=create_app()
if __name__=='__main__': app.run(debug=True)
