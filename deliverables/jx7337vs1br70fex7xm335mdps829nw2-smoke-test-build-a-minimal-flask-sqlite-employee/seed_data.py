from app import create_app, db
from app.models import User, Employee, Note

app = create_app()

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(username="admin")
    admin.set_password("admin123")

    e1 = Employee(name="Ava Singh", email="ava@example.com")
    e2 = Employee(name="Rahul Mehta", email="rahul@example.com")

    db.session.add_all([admin, e1, e2])
    db.session.flush()

    db.session.add_all([
        Note(title="Onboarding", body="Completed HR onboarding.", employee_id=e1.id),
        Note(title="Laptop issued", body="MacBook Pro assigned.", employee_id=e2.id),
    ])

    db.session.commit()
    print("Seeded: admin/admin123 + 2 employees + 2 notes")
