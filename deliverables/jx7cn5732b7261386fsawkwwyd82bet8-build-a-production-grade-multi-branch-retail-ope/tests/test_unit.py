from tests.conftest import login

def test_kpi_api_has_keys(client):
    login(client, 'admin', 'admin123')
    rv = client.get('/api/kpis')
    data = rv.get_json()
    assert set(data.keys()) == {'daily_sales', 'total_margin', 'stock_turnover'}

def test_password_login_rejects_invalid(client):
    rv = client.post('/login', data={'username': 'admin', 'password': 'wrong'})
    assert b'Invalid credentials' in rv.data
