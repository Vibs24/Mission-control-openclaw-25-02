from tests.conftest import login

def test_login_dashboard(client):
    r=login(client)
    assert b'KPI Dashboard' in r.data
