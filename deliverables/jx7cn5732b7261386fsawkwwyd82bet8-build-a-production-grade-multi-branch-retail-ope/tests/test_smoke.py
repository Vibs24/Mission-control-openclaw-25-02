from app import create_app
from app.models import db, User, Branch


def test_login_and_dashboard_smoke():
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:'})
    with app.app_context():
        db.create_all()
        b = Branch(name='B1', city='Pune'); db.session.add(b); db.session.flush()
        u = User(username='admin', role='Admin', branch_id=b.id); u.set_password('admin123'); db.session.add(u); db.session.commit()
    c = app.test_client()
    r = c.post('/login', data={'username':'admin','password':'admin123'}, follow_redirects=True)
    assert b'daily_sales' in r.data
