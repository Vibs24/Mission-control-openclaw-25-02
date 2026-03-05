from app.models import User


def test_password_hashing():
    u = User(username='x', role='Admin')
    u.set_password('abc123')
    assert u.check_password('abc123')
    assert not u.check_password('wrong')
