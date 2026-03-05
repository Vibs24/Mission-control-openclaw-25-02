import os
import sys
import tempfile
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app, db
from app.models import User, Department, Employee


@pytest.fixture
def client():
    db_fd, db_path = tempfile.mkstemp()
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{db_path}',
        'SECRET_KEY': 'test-key',
    })
    with app.app_context():
        db.create_all()
        dep = Department(name='Engineering')
        db.session.add(dep)
        db.session.flush()

        admin = User(username='admin', role='Admin')
        admin.set_password('admin123')
        manager = User(username='manager', role='Manager')
        manager.set_password('manager123')
        reviewer = User(username='reviewer', role='Reviewer')
        reviewer.set_password('reviewer123')
        db.session.add_all([admin, manager, reviewer])
        db.session.add(Employee(code='EMP001', full_name='Test User', email='test@example.com', role_title='Engineer', salary_monthly=50000, status='Active', department_id=dep.id))
        db.session.commit()

    with app.test_client() as c:
        yield c

    os.close(db_fd)
    os.unlink(db_path)


def login(client, username, password):
    return client.post('/login', data={'username': username, 'password': password}, follow_redirects=True)
