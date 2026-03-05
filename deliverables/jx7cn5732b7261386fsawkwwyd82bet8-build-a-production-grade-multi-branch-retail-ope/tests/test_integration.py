from tests.conftest import login

def test_create_sale_and_invoice_pdf(client):
    login(client, 'staff1', 'staff123')
    sale = client.post('/sales/new', data={
        'branch_id': 1,
        'customer_id': 1,
        'product_id': ['1'],
        'qty': ['2']
    }, follow_redirects=True)
    assert b'Invoice #' in sale.data
    sale_id = int(sale.request.path.split('/')[-1])
    pdf = client.get(f'/invoice/{sale_id}.pdf')
    assert pdf.status_code == 200
    assert pdf.mimetype == 'application/pdf'

def test_manager_can_add_vendor(client):
    login(client, 'manager1', 'manager123')
    rv = client.post('/vendors', data={'name':'New Vendor','contact':'111','branch_id':1}, follow_redirects=True)
    assert b'New Vendor' in rv.data
