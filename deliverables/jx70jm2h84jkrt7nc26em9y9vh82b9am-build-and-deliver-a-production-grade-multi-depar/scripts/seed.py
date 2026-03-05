import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import app, db, User, Department, Employee, Shift, Attendance, LeaveRequest
from werkzeug.security import generate_password_hash
from datetime import date
with app.app_context():
    db.drop_all(); db.create_all()
    d1=Department(name='Engineering'); d2=Department(name='HR'); db.session.add_all([d1,d2]); db.session.flush()
    db.session.add_all([
        User(username='admin', password_hash=generate_password_hash('admin123'), role='Admin'),
        User(username='manager', password_hash=generate_password_hash('manager123'), role='Manager'),
        User(username='reviewer', password_hash=generate_password_hash('review123'), role='Reviewer')])
    e1=Employee(name='Asha', email='asha@org.com', department_id=d1.id); e2=Employee(name='Ravi', email='ravi@org.com', department_id=d2.id)
    db.session.add_all([e1,e2]); db.session.flush()
    db.session.add_all([Shift(employee_id=e1.id, day=date.today(), start='09:00', end='17:00'), Attendance(employee_id=e1.id, day=date.today(), status='present'), LeaveRequest(employee_id=e2.id, start_date=date.today(), end_date=date.today(), status='pending', reason='Medical')])
    db.session.commit()
print('Seeded users: admin/admin123 manager/manager123 reviewer/review123')
