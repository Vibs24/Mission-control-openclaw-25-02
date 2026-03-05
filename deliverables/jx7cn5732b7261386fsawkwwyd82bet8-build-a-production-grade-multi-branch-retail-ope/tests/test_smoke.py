from conftest import login


def test_smoke_login_dashboard_export(client):
    rv = login(client, 'admin', 'admin123')
    assert b'Daily Sales' in rv.data

    inv = client.get('/export/inventory.csv')
    assert inv.status_code == 200
    assert inv.mimetype == 'text/csv'
