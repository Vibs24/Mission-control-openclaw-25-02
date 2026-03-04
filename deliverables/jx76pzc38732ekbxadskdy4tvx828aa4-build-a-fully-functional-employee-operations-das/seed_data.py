from werkzeug.security import generate_password_hash
from app import create_app, db, User, Department, Employee, Task, Attendance, LeaveRequest, AuditLog
from datetime import date, timedelta

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(username="admin", password_hash=generate_password_hash("admin123"))
    db.session.add(admin)

    eng = Department(name="Engineering", description="Builds product")
    hr = Department(name="HR", description="People ops")
    db.session.add_all([eng, hr])
    db.session.flush()

    e1 = Employee(name="Asha Nair", email="asha@example.com", role="Backend Engineer", status="active", department_id=eng.id)
    e2 = Employee(name="Ravi Singh", email="ravi@example.com", role="HR Manager", status="active", department_id=hr.id)
    e3 = Employee(name="Meera Jain", email="meera@example.com", role="QA Engineer", status="inactive", department_id=eng.id)
    db.session.add_all([e1, e2, e3])
    db.session.flush()

    db.session.add_all([
        Task(title="Prepare API spec", priority="high", status="open", employee_id=e1.id),
        Task(title="Run onboarding batch", priority="medium", status="in_progress", employee_id=e2.id),
        Task(title="Regression test", priority="low", status="done", employee_id=e3.id),
    ])

    db.session.add_all([
        Attendance(employee_id=e1.id, day=date.today(), status="present"),
        Attendance(employee_id=e2.id, day=date.today(), status="present"),
        Attendance(employee_id=e3.id, day=date.today()-timedelta(days=1), status="absent"),
    ])

    db.session.add_all([
        LeaveRequest(employee_id=e2.id, start_date=date.today()+timedelta(days=7), end_date=date.today()+timedelta(days=10), status="pending", reason="Family event"),
        LeaveRequest(employee_id=e1.id, start_date=date.today()-timedelta(days=20), end_date=date.today()-timedelta(days=18), status="approved", reason="Vacation"),
    ])

    db.session.add(AuditLog(actor="system", action="Seeded initial dataset"))
    db.session.commit()

print("Seed complete. Login: admin / admin123")
