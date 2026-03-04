import pytest
from werkzeug.security import generate_password_hash
from app import app, db, User, Employee

@pytest.fixture()
def client():
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:')
    with app.app_context():
        db.drop_all()
        db.create_all()
        db.session.add(User(username='admin', password_hash=generate_password_hash('admin123')))
        db.session.add(Employee(name='Test', email='test@example.com'))
        db.session.commit()
    with app.test_client() as c:
        yield c

def login(c):
    return c.post('/login', data={'username':'admin','password':'admin123'}, follow_redirects=True)

def test_login_and_dashboard(client):
    r = login(client)
    assert b'Employee Notes' in r.data

def test_create_employee(client):
    login(client)
    r = client.post('/employees', data={'name':'New','email':'new@example.com'}, follow_redirects=True)
    assert b'new@example.com' in r.data

