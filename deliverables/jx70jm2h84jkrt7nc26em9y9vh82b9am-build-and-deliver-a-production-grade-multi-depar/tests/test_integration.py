from app import create_app
from app.models import db, User, Employee


def setup_client():
    app = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        u = User(username='admin', role='Admin'); u.set_password('admin123')
        db.session.add(u); db.session.commit()
    return app.test_client(), app


def login(c):
    return c.post('/login', data={'username':'admin','password':'admin123'}, follow_redirects=True)


def test_create_employee_integration():
    c, app = setup_client(); login(c)
    r = c.post('/employees', data={'name':'John','email':'john@x.com','department':'Ops','status':'active'}, follow_redirects=True)
    assert r.status_code == 200
    with app.app_context():
        assert Employee.query.filter_by(name='John').first() is not None
