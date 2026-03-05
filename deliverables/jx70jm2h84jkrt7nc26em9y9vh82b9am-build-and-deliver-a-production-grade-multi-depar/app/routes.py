import csv
from io import StringIO
from datetime import date, datetime
from functools import wraps
from flask import Blueprint, render_template, request, redirect, url_for, flash, Response, abort
from flask_login import login_user, logout_user, login_required, current_user
from fpdf import FPDF
from . import db
from .models import User, Department, Employee, Shift, Attendance, LeaveRequest, AuditLog

bp = Blueprint('main', __name__)


def log(action, entity, detail):
    db.session.add(AuditLog(actor=current_user.username if current_user.is_authenticated else 'system', action=action, entity=entity, detail=detail))


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if current_user.role not in roles:
                abort(403)
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def paginate(query, default=10):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', default, type=int)
    return query.paginate(page=page, per_page=per_page, error_out=False)


@bp.route('/')
def root():
    return redirect(url_for('main.dashboard') if current_user.is_authenticated else url_for('main.login'))


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username'].strip()).first()
        if user and user.check_password(request.form['password']):
            login_user(user)
            log('login', 'auth', f'{user.username} logged in')
            db.session.commit()
            return redirect(url_for('main.dashboard'))
        flash('Invalid credentials', 'danger')
    return render_template('login.html')


@bp.route('/logout')
@login_required
def logout():
    log('logout', 'auth', f'{current_user.username} logged out')
    db.session.commit()
    logout_user()
    return redirect(url_for('main.login'))


@bp.route('/dashboard')
@login_required
def dashboard():
    employees = Employee.query.count()
    present_today = Attendance.query.filter_by(day=date.today(), status='Present').count()
    pending_leaves = LeaveRequest.query.filter_by(status='Pending').count()
    payroll_total = db.session.query(db.func.coalesce(db.func.sum(Employee.salary_monthly), 0)).scalar() or 0
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(12).all()
    return render_template('dashboard.html', employees=employees, present_today=present_today, pending_leaves=pending_leaves, payroll_total=payroll_total, logs=logs)


@bp.route('/departments', methods=['GET', 'POST'])
@login_required
@role_required('Admin', 'Manager')
def departments():
    if request.method == 'POST':
        d = Department(name=request.form['name'])
        db.session.add(d)
        db.session.flush()
        log('create', 'department', d.name)
        db.session.commit()
        return redirect(url_for('main.departments'))
    pagination = paginate(Department.query.order_by(Department.name.asc()))
    return render_template('departments.html', pagination=pagination)


@bp.route('/employees', methods=['GET', 'POST'])
@login_required
def employees():
    if request.method == 'POST':
        if current_user.role not in ['Admin', 'Manager']:
            abort(403)
        e = Employee(
            code=request.form['code'], full_name=request.form['full_name'], email=request.form['email'],
            role_title=request.form['role_title'], salary_monthly=float(request.form['salary_monthly']),
            status=request.form['status'], department_id=int(request.form['department_id'])
        )
        db.session.add(e)
        db.session.flush()
        log('create', 'employee', e.full_name)
        db.session.commit()
        return redirect(url_for('main.employees'))

    q = request.args.get('q', '').strip()
    dep = request.args.get('department_id', type=int)
    query = Employee.query
    if q:
        query = query.filter(Employee.full_name.contains(q) | Employee.code.contains(q) | Employee.email.contains(q))
    if dep:
        query = query.filter_by(department_id=dep)
    pagination = paginate(query.order_by(Employee.full_name.asc()))
    return render_template('employees.html', pagination=pagination, departments=Department.query.order_by(Department.name).all(), q=q, selected_dept=dep)


@bp.route('/employees/<int:eid>/delete', methods=['POST'])
@login_required
@role_required('Admin')
def delete_employee(eid):
    e = Employee.query.get_or_404(eid)
    name = e.full_name
    db.session.delete(e)
    log('delete', 'employee', name)
    db.session.commit()
    return redirect(url_for('main.employees'))


@bp.route('/shifts', methods=['GET', 'POST'])
@login_required
@role_required('Admin', 'Manager')
def shifts():
    if request.method == 'POST':
        s = Shift(
            employee_id=int(request.form['employee_id']),
            shift_date=datetime.strptime(request.form['shift_date'], '%Y-%m-%d').date(),
            shift_name=request.form['shift_name'],
            start_time=request.form['start_time'],
            end_time=request.form['end_time'],
        )
        db.session.add(s)
        db.session.flush()
        log('create', 'shift', f'{s.employee.full_name} {s.shift_date}')
        db.session.commit()
        return redirect(url_for('main.shifts'))
    pagination = paginate(Shift.query.order_by(Shift.shift_date.desc()))
    return render_template('shifts.html', pagination=pagination, employees=Employee.query.order_by(Employee.full_name).all())


@bp.route('/attendance', methods=['GET', 'POST'])
@login_required
def attendance():
    if request.method == 'POST':
        a = Attendance(
            employee_id=int(request.form['employee_id']),
            day=datetime.strptime(request.form['day'], '%Y-%m-%d').date(),
            status=request.form['status'],
            check_in=request.form.get('check_in'),
            check_out=request.form.get('check_out'),
        )
        db.session.add(a)
        db.session.flush()
        log('create', 'attendance', f'{a.employee.full_name} {a.day}')
        db.session.commit()
        return redirect(url_for('main.attendance'))

    day = request.args.get('day')
    query = Attendance.query
    if day:
        query = query.filter_by(day=datetime.strptime(day, '%Y-%m-%d').date())
    pagination = paginate(query.order_by(Attendance.day.desc()))
    return render_template('attendance.html', pagination=pagination, employees=Employee.query.order_by(Employee.full_name).all(), day_filter=day)


@bp.route('/leaves', methods=['GET', 'POST'])
@login_required
def leaves():
    if request.method == 'POST':
        l = LeaveRequest(
            employee_id=int(request.form['employee_id']),
            leave_type=request.form['leave_type'],
            start_date=datetime.strptime(request.form['start_date'], '%Y-%m-%d').date(),
            end_date=datetime.strptime(request.form['end_date'], '%Y-%m-%d').date(),
            status=request.form['status'],
            reason=request.form.get('reason'),
        )
        db.session.add(l)
        db.session.flush()
        log('create', 'leave', f'{l.employee.full_name} {l.status}')
        db.session.commit()
        return redirect(url_for('main.leaves'))

    status = request.args.get('status', '')
    query = LeaveRequest.query
    if status:
        query = query.filter_by(status=status)
    pagination = paginate(query.order_by(LeaveRequest.start_date.desc()))
    return render_template('leaves.html', pagination=pagination, employees=Employee.query.order_by(Employee.full_name).all(), selected_status=status)


@bp.route('/export/payroll.csv')
@login_required
def export_payroll_csv():
    out = StringIO()
    w = csv.writer(out)
    w.writerow(['Code', 'Name', 'Department', 'Role', 'Monthly Salary'])
    for e in Employee.query.order_by(Employee.full_name).all():
        w.writerow([e.code, e.full_name, e.department.name, e.role_title, e.salary_monthly])
    return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition': 'attachment; filename=payroll.csv'})


@bp.route('/export/attendance.csv')
@login_required
def export_attendance_csv():
    out = StringIO()
    w = csv.writer(out)
    w.writerow(['Date', 'Employee', 'Status', 'Check In', 'Check Out'])
    for a in Attendance.query.order_by(Attendance.day.desc()).all():
        w.writerow([a.day, a.employee.full_name, a.status, a.check_in, a.check_out])
    return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition': 'attachment; filename=attendance.csv'})


@bp.route('/export/payroll.pdf')
@login_required
def export_payroll_pdf():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 14)
    pdf.cell(0, 10, 'Payroll Ready Report', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', size=10)
    for e in Employee.query.order_by(Employee.full_name).all():
        pdf.cell(0, 8, f'{e.code} | {e.full_name} | {e.department.name} | {e.salary_monthly}', new_x='LMARGIN', new_y='NEXT')
    raw = bytes(pdf.output())
    return Response(raw, mimetype='application/pdf', headers={'Content-Disposition': 'attachment; filename=payroll.pdf'})


@bp.route('/audit')
@login_required
@role_required('Admin', 'Reviewer')
def audit():
    pagination = paginate(AuditLog.query.order_by(AuditLog.created_at.desc()))
    return render_template('audit.html', pagination=pagination)
