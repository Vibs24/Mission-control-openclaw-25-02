from app.models import User


def test_password_hashing():
    u = User(username='x', role='Admin')
    u.set_password('abc')
    assert u.check_password('abc')
    assert not u.check_password('zzz')
