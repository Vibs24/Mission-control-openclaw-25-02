from app import create_app, db
from app.models import User, Department, Employee, Shift, Attendance, LeaveRequest
from datetime import date

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    d1 = Department(name='Engineering')
    d2 = Department(name='Operations')
    d3 = Department(name='Finance')
    db.session.add_all([d1, d2, d3])
    db.session.flush()

    admin = User(username='admin', role='Admin')
    admin.set_password('admin123')
    manager = User(username='manager', role='Manager')
    manager.set_password('manager123')
    reviewer = User(username='reviewer', role='Reviewer')
    reviewer.set_password('reviewer123')
    db.session.add_all([admin, manager, reviewer])

    e1 = Employee(code='EMP001', full_name='Aarav Shah', email='aarav@example.com', role_title='Lead Engineer', salary_monthly=120000, status='Active', department_id=d1.id)
    e2 = Employee(code='EMP002', full_name='Riya Patel', email='riya@example.com', role_title='Ops Manager', salary_monthly=95000, status='Active', department_id=d2.id)
    e3 = Employee(code='EMP003', full_name='Neha Rao', email='neha@example.com', role_title='Analyst', salary_monthly=70000, status='On Leave', department_id=d3.id)
    db.session.add_all([e1, e2, e3])
    db.session.flush()

    db.session.add_all([
        Shift(employee_id=e1.id, shift_date=date.today(), shift_name='Morning', start_time='09:00', end_time='18:00'),
        Shift(employee_id=e2.id, shift_date=date.today(), shift_name='General', start_time='10:00', end_time='19:00'),
        Attendance(employee_id=e1.id, day=date.today(), status='Present', check_in='09:01', check_out='18:04'),
        Attendance(employee_id=e2.id, day=date.today(), status='Present', check_in='10:00', check_out='19:01'),
        LeaveRequest(employee_id=e3.id, leave_type='Sick', start_date=date.today(), end_date=date.today(), status='Pending', reason='Medical rest')
    ])

    db.session.commit()
    print('Seed complete: users + departments + employees + shifts + attendance + leaves')
