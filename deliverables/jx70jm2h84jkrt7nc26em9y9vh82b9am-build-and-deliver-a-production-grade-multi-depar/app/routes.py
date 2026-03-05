import csv
from io import StringIO, BytesIO
from functools import wraps
from datetime import date, datetime
from flask import render_template, request, redirect, url_for, flash, abort, Response, send_file
from flask_login import login_user, logout_user, login_required, current_user
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from .models import db, User, Employee, Shift, Attendance, LeaveRequest, AuditLog


def register_routes(app):
    def log(action, detail):
        db.session.add(AuditLog(action=action, detail=detail))

    def require_roles(*roles):
        def deco(fn):
            @wraps(fn)
            def wrap(*a, **k):
                if current_user.role not in roles:
                    abort(403)
                return fn(*a, **k)
            return wrap
        return deco

    def paginate(query):
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        return query.paginate(page=page, per_page=per_page, error_out=False)

    @app.route('/')
    def home():
        return redirect(url_for('dashboard') if current_user.is_authenticated else url_for('login'))

    @app.route('/login', methods=['GET','POST'])
    def login():
        if request.method == 'POST':
            u = User.query.filter_by(username=request.form['username'].strip()).first()
            if u and u.check_password(request.form['password']):
                login_user(u); log('auth.login', u.username); db.session.commit(); return redirect(url_for('dashboard'))
            flash('Invalid credentials', 'danger')
        return render_template('login.html')

    @app.route('/logout')
    @login_required
    def logout():
        log('auth.logout', current_user.username); db.session.commit(); logout_user(); return redirect(url_for('login'))

    @app.route('/dashboard')
    @login_required
    def dashboard():
        today = date.today()
        present = Attendance.query.filter_by(day=today, status='present').count()
        pending_leave = LeaveRequest.query.filter_by(status='pending').count()
        active_emp = Employee.query.filter_by(status='active').count()
        shifts_today = Shift.query.filter_by(shift_date=today).count()
        return render_template('dashboard.html', kpi={
            'active_employees': active_emp,
            'today_shifts': shifts_today,
            'present_today': present,
            'pending_leaves': pending_leave,
        })

    @app.route('/employees', methods=['GET','POST'])
    @login_required
    @require_roles('Admin','Manager')
    def employees():
        if request.method == 'POST':
            e = Employee(name=request.form['name'], email=request.form['email'], department=request.form['department'], status=request.form.get('status','active'))
            db.session.add(e); log('employee.create', e.name); db.session.commit(); return redirect(url_for('employees'))
        q = request.args.get('q','').strip()
        query = Employee.query
        if q:
            query = query.filter((Employee.name.ilike(f'%{q}%')) | (Employee.department.ilike(f'%{q}%')))
        return render_template('employees.html', rows=paginate(query.order_by(Employee.id.desc())), q=q)

    @app.route('/employees/<int:eid>/delete', methods=['POST'])
    @login_required
    @require_roles('Admin')
    def delete_employee(eid):
        e = db.session.get(Employee, eid)
        if not e: abort(404)
        log('employee.delete', e.name); db.session.delete(e); db.session.commit(); return redirect(url_for('employees'))

    @app.route('/shifts', methods=['GET','POST'])
    @login_required
    @require_roles('Admin','Manager')
    def shifts():
        if request.method == 'POST':
            s = Shift(employee_id=int(request.form['employee_id']), shift_date=datetime.strptime(request.form['shift_date'], '%Y-%m-%d').date(), start_time=request.form['start_time'], end_time=request.form['end_time'])
            db.session.add(s); log('shift.create', f'emp={s.employee_id}'); db.session.commit(); return redirect(url_for('shifts'))
        return render_template('shifts.html', rows=paginate(Shift.query.order_by(Shift.shift_date.desc())), employees=Employee.query.all())

    @app.route('/attendance', methods=['GET','POST'])
    @login_required
    @require_roles('Admin','Manager','Reviewer')
    def attendance():
        if request.method == 'POST':
            a = Attendance(employee_id=int(request.form['employee_id']), day=datetime.strptime(request.form['day'],'%Y-%m-%d').date(), status=request.form['status'])
            db.session.add(a); log('attendance.mark', f'emp={a.employee_id}:{a.status}'); db.session.commit(); return redirect(url_for('attendance'))
        return render_template('attendance.html', rows=paginate(Attendance.query.order_by(Attendance.day.desc())), employees=Employee.query.all())

    @app.route('/leaves', methods=['GET','POST'])
    @login_required
    @require_roles('Admin','Manager','Reviewer')
    def leaves():
        if request.method == 'POST':
            l = LeaveRequest(employee_id=int(request.form['employee_id']), start_date=datetime.strptime(request.form['start_date'],'%Y-%m-%d').date(), end_date=datetime.strptime(request.form['end_date'],'%Y-%m-%d').date(), reason=request.form.get('reason',''), status=request.form.get('status','pending'))
            db.session.add(l); log('leave.create', f'emp={l.employee_id}'); db.session.commit(); return redirect(url_for('leaves'))
        status = request.args.get('status','')
        query = LeaveRequest.query
        if status:
            query = query.filter_by(status=status)
        return render_template('leaves.html', rows=paginate(query.order_by(LeaveRequest.id.desc())), employees=Employee.query.all(), status=status)

    @app.route('/export/payroll.csv')
    @login_required
    @require_roles('Admin','Manager')
    def payroll_export():
        out = StringIO(); w = csv.writer(out)
        w.writerow(['employee_id','name','department','present_days'])
        for e in Employee.query.all():
            present_days = Attendance.query.filter_by(employee_id=e.id, status='present').count()
            w.writerow([e.id, e.name, e.department, present_days])
        return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=payroll_ready.csv'})

    @app.route('/export/attendance.csv')
    @login_required
    def attendance_csv():
        out = StringIO(); w = csv.writer(out)
        w.writerow(['id','employee','day','status'])
        for r in Attendance.query.all():
            w.writerow([r.id, r.employee.name, r.day, r.status])
        return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=attendance.csv'})

    @app.route('/export/leave/<int:leave_id>.pdf')
    @login_required
    def leave_pdf(leave_id):
        l = db.session.get(LeaveRequest, leave_id)
        if not l: abort(404)
        b = BytesIO(); c = canvas.Canvas(b, pagesize=A4)
        c.drawString(50, 800, f'Leave Request #{l.id}')
        c.drawString(50, 780, f'Employee: {l.employee.name}')
        c.drawString(50, 760, f'From: {l.start_date} To: {l.end_date}')
        c.drawString(50, 740, f'Status: {l.status}')
        c.drawString(50, 720, f'Reason: {l.reason}')
        c.save(); b.seek(0)
        return send_file(b, mimetype='application/pdf', as_attachment=True, download_name=f'leave_{l.id}.pdf')

    @app.route('/audit')
    @login_required
    @require_roles('Admin','Manager')
    def audit():
        return render_template('audit.html', rows=paginate(AuditLog.query.order_by(AuditLog.id.desc())))

    @app.route('/health')
    def health():
        db.session.execute(db.text('SELECT 1'))
        return {'status':'ok'}
