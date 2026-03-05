from tests.conftest import login


def test_login_success(client):
    r = login(client, "admin", "admin123")
    assert b"Dashboard" in r.data


def test_login_failure(client):
    r = login(client, "admin", "bad")
    assert b"Invalid credentials" in r.data
