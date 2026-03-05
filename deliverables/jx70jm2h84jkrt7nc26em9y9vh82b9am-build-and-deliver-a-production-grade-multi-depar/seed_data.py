from datetime import date, timedelta
from app import create_app
from app.models import db, User, Employee, Shift, Attendance, LeaveRequest, AuditLog

app = create_app()
with app.app_context():
    db.drop_all(); db.create_all()

    admin = User(username='admin', role='Admin'); admin.set_password('admin123')
    manager = User(username='manager', role='Manager'); manager.set_password('manager123')
    reviewer = User(username='reviewer', role='Reviewer'); reviewer.set_password('reviewer123')
    db.session.add_all([admin, manager, reviewer])

    e1 = Employee(name='Aditi Rao', email='aditi@corp.local', department='Ops', status='active')
    e2 = Employee(name='Rahul Patil', email='rahul@corp.local', department='Finance', status='active')
    db.session.add_all([e1,e2]); db.session.flush()

    db.session.add_all([
        Shift(employee_id=e1.id, shift_date=date.today(), start_time='09:00', end_time='18:00'),
        Shift(employee_id=e2.id, shift_date=date.today(), start_time='10:00', end_time='19:00'),
    ])

    db.session.add_all([
        Attendance(employee_id=e1.id, day=date.today(), status='present'),
        Attendance(employee_id=e2.id, day=date.today(), status='present'),
    ])

    db.session.add(LeaveRequest(employee_id=e2.id, start_date=date.today()+timedelta(days=3), end_date=date.today()+timedelta(days=4), status='pending', reason='Medical'))
    db.session.add(AuditLog(action='seed.complete', detail='Initial data generated'))
    db.session.commit()
    print('Seeded users: admin/admin123 manager/manager123 reviewer/reviewer123')
