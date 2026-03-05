from conftest import login


def test_admin_can_create_branch(client):
    login(client, 'admin', 'admin123')
    rv = client.post('/branches', data={'name': 'North', 'city': 'Navi Mumbai'}, follow_redirects=True)
    assert rv.status_code == 200
    assert b'North' in rv.data


def test_staff_blocked_from_admin_endpoint(client):
    login(client, 'staff', 'staff123')
    rv = client.get('/branches')
    assert rv.status_code == 403


def test_sale_reduces_inventory_and_invoice_available(client):
    login(client, 'manager', 'manager123')
    rv = client.post('/sales', data={'branch_id': '1', 'customer_id': '1', 'product_id': '1', 'qty': '2'}, follow_redirects=True)
    assert rv.status_code == 200
    assert b'PDF' in rv.data
    pdf = client.get('/invoice/1.pdf')
    assert pdf.status_code == 200
    assert pdf.mimetype == 'application/pdf'
