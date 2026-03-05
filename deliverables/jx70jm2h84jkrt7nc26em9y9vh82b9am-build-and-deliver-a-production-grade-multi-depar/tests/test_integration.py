from tests.conftest import login

def test_create_employee_flow(client):
    login(client)
    r=client.post('/employees', data={'name':'New E','email':'new@e.com'}, follow_redirects=True)
    assert b'new@e.com' in r.data

def test_payroll_export(client):
    login(client)
    r=client.get('/payroll.csv')
    assert r.status_code==200 and b'days_present' in r.data
