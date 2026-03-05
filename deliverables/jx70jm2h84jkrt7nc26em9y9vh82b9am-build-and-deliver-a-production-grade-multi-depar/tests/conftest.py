import pytest, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import app, db, User
from werkzeug.security import generate_password_hash

@pytest.fixture
def client():
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:')
    with app.app_context():
        db.drop_all(); db.create_all()
        db.session.add(User(username='admin',password_hash=generate_password_hash('admin123'),role='Admin'))
        db.session.add(User(username='reviewer',password_hash=generate_password_hash('review123'),role='Reviewer'))
        db.session.commit()
    with app.test_client() as c: yield c

def login(c, u='admin', p='admin123'):
    return c.post('/login', data={'username':u,'password':p}, follow_redirects=True)
