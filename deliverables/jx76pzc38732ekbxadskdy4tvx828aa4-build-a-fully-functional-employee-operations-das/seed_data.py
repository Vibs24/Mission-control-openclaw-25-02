from datetime import date, timedelta
from app import create_app, db
from app.models import Attendance, Department, Employee, Leave, Task, User

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(username="admin")
    admin.set_password("admin123")
    db.session.add(admin)

    eng = Department(name="Engineering", description="Product development")
    hr = Department(name="Human Resources", description="People operations")
    ops = Department(name="Operations", description="Process and logistics")
    db.session.add_all([eng, hr, ops])
    db.session.flush()

    emps = [
        Employee(employee_code="EMP001", full_name="Asha Mehta", email="asha@example.com", role="Backend Engineer", status="Active", joining_date=date(2024, 1, 10), department_id=eng.id),
        Employee(employee_code="EMP002", full_name="Rohit Jain", email="rohit@example.com", role="HR Manager", status="Active", joining_date=date(2023, 7, 1), department_id=hr.id),
        Employee(employee_code="EMP003", full_name="Nina Shah", email="nina@example.com", role="Ops Analyst", status="On Leave", joining_date=date(2022, 9, 4), department_id=ops.id),
    ]
    db.session.add_all(emps)
    db.session.flush()

    db.session.add_all([
        Task(title="Build payroll export", priority="High", status="In Progress", employee_id=emps[0].id, due_date=date.today()+timedelta(days=5)),
        Task(title="Quarterly hiring report", priority="Medium", status="Open", employee_id=emps[1].id, due_date=date.today()+timedelta(days=7)),
        Task(title="Warehouse SOP review", priority="Low", status="Done", employee_id=emps[2].id),
    ])

    for e in emps:
        db.session.add(Attendance(employee_id=e.id, day=date.today(), status="Present", check_in="09:15", check_out="18:20"))

    db.session.add(Leave(employee_id=emps[2].id, leave_type="Casual", start_date=date.today(), end_date=date.today()+timedelta(days=2), status="Pending", reason="Family event"))

    db.session.commit()
    print("Seed complete. Login: admin / admin123")
