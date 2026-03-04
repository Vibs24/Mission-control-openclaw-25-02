from app import app, db, User, Employee, Note
from werkzeug.security import generate_password_hash

with app.app_context():
    db.drop_all()
    db.create_all()

    admin = User(username='admin', password_hash=generate_password_hash('admin123'))
    e1 = Employee(name='Asha', email='asha@example.com')
    e2 = Employee(name='Ravi', email='ravi@example.com')
    db.session.add_all([admin, e1, e2])
    db.session.flush()

    db.session.add_all([
        Note(content='Onboarding completed', employee_id=e1.id),
        Note(content='Needs access to analytics', employee_id=e2.id),
    ])
    db.session.commit()

print('Seeded. Login: admin/admin123')
