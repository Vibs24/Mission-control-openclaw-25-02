from conftest import login


def test_smoke_dashboard_and_exports(client):
    rv = login(client, 'admin', 'admin123')
    assert b'Employees' in rv.data
    csv1 = client.get('/export/payroll.csv')
    assert csv1.status_code == 200
    assert csv1.mimetype == 'text/csv'
    pdf = client.get('/export/payroll.pdf')
    assert pdf.status_code == 200
    assert pdf.mimetype == 'application/pdf'
