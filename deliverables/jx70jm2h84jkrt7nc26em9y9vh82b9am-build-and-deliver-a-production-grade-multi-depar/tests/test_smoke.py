from app import create_app
from app.models import db, User


def test_login_smoke():
    app = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        u = User(username='manager', role='Manager'); u.set_password('manager123')
        db.session.add(u); db.session.commit()
    c = app.test_client()
    r = c.post('/login', data={'username':'manager','password':'manager123'}, follow_redirects=True)
    assert b'active_employees' in r.data
