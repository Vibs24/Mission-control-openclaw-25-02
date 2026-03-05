from tests.conftest import login

def test_health(client):
    rv=client.get('/api/health')
    assert rv.status_code==200 and rv.get_json()['status']=='ok'

def test_invalid_login(client):
    rv=client.post('/login',data={'username':'admin','password':'bad'})
    assert b'Invalid credentials' in rv.data
