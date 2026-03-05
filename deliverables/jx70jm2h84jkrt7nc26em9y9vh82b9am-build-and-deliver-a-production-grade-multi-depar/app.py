from datetime import date, datetime
from io import BytesIO, StringIO
import csv
from flask import Flask, render_template, request, redirect, url_for, flash, Response, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from reportlab.pdfgen import canvas

app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-me'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///workforce.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)

class Department(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey('department.id'))
    department = db.relationship('Department')

class Shift(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    day = db.Column(db.Date, nullable=False)
    start = db.Column(db.String(5), nullable=False)
    end = db.Column(db.String(5), nullable=False)
    employee = db.relationship('Employee')

class Attendance(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    day = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False)
    employee = db.relationship('Employee')

class LeaveRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    reason = db.Column(db.String(255))
    employee = db.relationship('Employee')

class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    actor = db.Column(db.String(80), nullable=False)
    action = db.Column(db.String(255), nullable=False)
    ts = db.Column(db.DateTime, default=datetime.utcnow)

@login_manager.user_loader
def load_user(uid):
    return db.session.get(User, int(uid))

def role_required(*roles):
    def deco(fn):
        from functools import wraps
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if current_user.role not in roles:
                return ('Forbidden', 403)
            return fn(*args, **kwargs)
        return wrapper
    return deco

def audit(action):
    db.session.add(AuditLog(actor=current_user.username if current_user.is_authenticated else 'system', action=action))
    db.session.commit()

def paginate(q):
    page = request.args.get('page', 1, type=int)
    return q.paginate(page=page, per_page=8, error_out=False)

@app.route('/')
def home():
    return redirect(url_for('dashboard') if current_user.is_authenticated else url_for('login'))

@app.route('/login', methods=['GET','POST'])
def login():
    if request.method == 'POST':
        u = User.query.filter_by(username=request.form['username']).first()
        if u and check_password_hash(u.password_hash, request.form['password']):
            login_user(u); audit('login'); return redirect(url_for('dashboard'))
        flash('Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    audit('logout'); logout_user(); return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    today = date.today()
    kpi = {
      'employees': Employee.query.count(),
      'present_today': Attendance.query.filter_by(day=today, status='present').count(),
      'pending_leaves': LeaveRequest.query.filter_by(status='pending').count(),
      'planned_shifts': Shift.query.filter_by(day=today).count()
    }
    logs = AuditLog.query.order_by(AuditLog.ts.desc()).limit(8).all()
    return render_template('dashboard.html', kpi=kpi, logs=logs)

@app.route('/employees', methods=['GET','POST'])
@login_required
@role_required('Admin','Manager')
def employees():
    if request.method == 'POST':
        e = Employee(name=request.form['name'], email=request.form['email'], department_id=request.form.get('department_id') or None)
        db.session.add(e); db.session.commit(); audit(f'create employee {e.name}')
        return redirect(url_for('employees'))
    s = request.args.get('q','')
    dep = request.args.get('dep','')
    q = Employee.query
    if s: q = q.filter((Employee.name.ilike(f'%{s}%')) | (Employee.email.ilike(f'%{s}%')))
    if dep: q = q.filter_by(department_id=int(dep))
    data = paginate(q.order_by(Employee.id.desc()))
    return render_template('employees.html', data=data, deps=Department.query.all(), s=s, dep=dep)

@app.route('/employees/<int:eid>/delete', methods=['POST'])
@login_required
@role_required('Admin')
def delete_employee(eid):
    e = Employee.query.get_or_404(eid); n=e.name
    db.session.delete(e); db.session.commit(); audit(f'delete employee {n}')
    return redirect(url_for('employees'))

@app.route('/shifts', methods=['GET','POST'])
@login_required
@role_required('Admin','Manager')
def shifts():
    if request.method == 'POST':
        s=Shift(employee_id=request.form['employee_id'],day=datetime.strptime(request.form['day'],'%Y-%m-%d').date(),start=request.form['start'],end=request.form['end'])
        db.session.add(s); db.session.commit(); audit('create shift')
        return redirect(url_for('shifts'))
    data=paginate(Shift.query.order_by(Shift.day.desc()))
    return render_template('shifts.html', data=data, employees=Employee.query.order_by(Employee.name).all())

@app.route('/attendance', methods=['GET','POST'])
@login_required
def attendance():
    if request.method == 'POST':
        r=Attendance(employee_id=request.form['employee_id'], day=datetime.strptime(request.form['day'],'%Y-%m-%d').date(), status=request.form['status'])
        db.session.add(r); db.session.commit(); audit('mark attendance')
        return redirect(url_for('attendance'))
    data=paginate(Attendance.query.order_by(Attendance.day.desc()))
    return render_template('attendance.html', data=data, employees=Employee.query.order_by(Employee.name).all())

@app.route('/leaves', methods=['GET','POST'])
@app.route('/leave', methods=['GET','POST'])
@login_required
def leaves():
    if request.method == 'POST':
        l=LeaveRequest(employee_id=request.form['employee_id'], start_date=datetime.strptime(request.form['start_date'],'%Y-%m-%d').date(), end_date=datetime.strptime(request.form['end_date'],'%Y-%m-%d').date(), status=request.form['status'], reason=request.form.get('reason',''))
        db.session.add(l); db.session.commit(); audit('create leave request')
        return redirect(url_for('leaves'))
    data=paginate(LeaveRequest.query.order_by(LeaveRequest.start_date.desc()))
    return render_template('leaves.html', data=data, employees=Employee.query.order_by(Employee.name).all())

@app.route('/payroll.csv')
@app.route('/export/payroll.csv')
@login_required
@role_required('Admin','Manager','Reviewer')
def payroll_csv():
    out=StringIO(); w=csv.writer(out); w.writerow(['employee','days_present','days_absent'])
    for e in Employee.query.all():
        p=Attendance.query.filter_by(employee_id=e.id,status='present').count(); a=Attendance.query.filter_by(employee_id=e.id,status='absent').count()
        w.writerow([e.name,p,a])
    return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=payroll.csv'})

@app.route('/export/attendance.csv')
@login_required
def export_att():
    out=StringIO(); w=csv.writer(out); w.writerow(['employee','day','status'])
    for r in Attendance.query.order_by(Attendance.day.desc()).all(): w.writerow([r.employee.name, r.day, r.status])
    return Response(out.getvalue(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=attendance.csv'})

@app.route('/export/audit.pdf')
@login_required
@role_required('Admin','Reviewer')
def export_audit_pdf():
    buf=BytesIO(); p=canvas.Canvas(buf); y=800
    p.drawString(50,y,'Audit Timeline'); y-=20
    for row in AuditLog.query.order_by(AuditLog.ts.desc()).limit(30):
        p.drawString(50,y,f"{row.ts} | {row.actor} | {row.action}"); y-=16
        if y<60: p.showPage(); y=800
    p.save(); buf.seek(0)
    return send_file(buf, as_attachment=True, download_name='audit.pdf', mimetype='application/pdf')

@app.route('/docs/health')
@app.route('/api/health')
@app.route('/health')
def health():
    ok = db.session.execute(db.text('select 1')).scalar()==1
    return {'status':'ok' if ok else 'degraded','db':'reachable' if ok else 'down','database': ok}

@app.route('/leaves/<int:lid>/review', methods=['POST'])
@app.route('/leave/<int:lid>/review', methods=['POST'])
@login_required
@role_required('Admin','Manager')
def review_leave(lid):
    lr = LeaveRequest.query.get_or_404(lid)
    new_status = (request.form.get('status') or request.form.get('action') or '').capitalize()
    if new_status not in {'Approved','Rejected'}:
        return ('Bad status', 400)
    lr.status = new_status
    db.session.commit()
    audit(f'leave {lid} {new_status}')
    flash(new_status.lower())
    return redirect(url_for('leaves'))

if __name__ == '__main__':
    with app.app_context(): db.create_all()
    app.run(debug=True)
