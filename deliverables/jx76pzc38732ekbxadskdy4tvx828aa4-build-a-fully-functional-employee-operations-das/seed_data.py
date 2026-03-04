from datetime import date, timedelta
from app import create_app
from app.models import db, User, Department, Employee, Task, Attendance, LeaveRequest, AuditLog

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(username="admin")
    admin.set_password("admin123")
    db.session.add(admin)

    eng = Department(name="Engineering", location="Pune")
    hr = Department(name="HR", location="Mumbai")
    db.session.add_all([eng, hr])
    db.session.flush()

    e1 = Employee(full_name="Aditi Rao", email="aditi@example.com", role="Backend Engineer", department_id=eng.id)
    e2 = Employee(full_name="Rahul Patil", email="rahul@example.com", role="HR Manager", department_id=hr.id, status="inactive")
    db.session.add_all([e1, e2])
    db.session.flush()

    db.session.add_all([
        Task(title="Build payroll API", priority="high", status="in_progress", employee_id=e1.id, due_date=date.today()+timedelta(days=5)),
        Task(title="Conduct onboarding", priority="medium", status="todo", employee_id=e2.id, due_date=date.today()+timedelta(days=2)),
    ])

    db.session.add_all([
        Attendance(employee_id=e1.id, day=date.today(), check_in="09:05", check_out="18:03", status="present"),
        Attendance(employee_id=e2.id, day=date.today(), status="absent"),
    ])

    db.session.add(LeaveRequest(employee_id=e1.id, start_date=date.today()+timedelta(days=7), end_date=date.today()+timedelta(days=9), reason="Family event", status="pending"))

    db.session.add(AuditLog(action="seed", detail="Initial demo data generated"))

    db.session.commit()
    print("Seeded successfully. Login: admin / admin123")
