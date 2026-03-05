from tests.conftest import login


def test_manager_purchase_updates_inventory_and_audit(client, app):
    login(client, "manager_central", "manager123")

    with app.app_context():
        db = app.get_db()
        branch_id = db.execute(
            "SELECT id FROM branches WHERE name = 'Central'"
        ).fetchone()["id"]
        product = db.execute(
            "SELECT p.id, i.qty FROM products p JOIN inventory i ON i.product_id = p.id "
            "WHERE p.branch_id = ? LIMIT 1",
            (branch_id,),
        ).fetchone()
        vendor_id = db.execute(
            "SELECT id FROM vendors WHERE branch_id = ? LIMIT 1", (branch_id,)
        ).fetchone()["id"]

    before_qty = product["qty"]
    response = client.post(
        "/purchases",
        data={
            "branch_id": branch_id,
            "product_id": product["id"],
            "vendor_id": vendor_id,
            "qty": "7",
            "unit_cost": "9.25",
        },
        follow_redirects=True,
    )

    assert response.status_code == 200
    assert b"Purchase recorded" in response.data

    with app.app_context():
        db = app.get_db()
        after_qty = db.execute(
            "SELECT qty FROM inventory WHERE product_id = ?", (product["id"],)
        ).fetchone()["qty"]
        audit = db.execute(
            "SELECT id FROM audit_logs WHERE entity = 'purchase' ORDER BY id DESC LIMIT 1"
        ).fetchone()

    assert after_qty == before_qty + 7
    assert audit is not None


def test_staff_can_create_sale_and_retrieve_invoice_pdf(client, app):
    login(client, "staff_central", "staff123")

    with app.app_context():
        db = app.get_db()
        branch_id = db.execute(
            "SELECT id FROM branches WHERE name = 'Central'"
        ).fetchone()["id"]
        customer_id = db.execute(
            "SELECT id FROM customers WHERE branch_id = ? LIMIT 1", (branch_id,)
        ).fetchone()["id"]
        product_id = db.execute(
            "SELECT p.id FROM products p JOIN inventory i ON i.product_id = p.id "
            "WHERE p.branch_id = ? AND i.qty > 4 LIMIT 1",
            (branch_id,),
        ).fetchone()["id"]

    sale = client.post(
        "/sales/new",
        data={
            "branch_id": branch_id,
            "customer_id": customer_id,
            "product_id": [str(product_id)],
            "qty": ["2"],
        },
        follow_redirects=True,
    )

    assert sale.status_code == 200
    assert b"Invoice #" in sale.data

    sale_id = int(sale.request.path.rsplit("/", 1)[-1])
    pdf = client.get(f"/invoice/{sale_id}.pdf")

    assert pdf.status_code == 200
    assert pdf.mimetype == "application/pdf"


def test_csv_and_pdf_exports_available(client):
    login(client, "admin", "admin123")

    csv_response = client.get("/export/inventory.csv")
    assert csv_response.status_code == 200
    assert csv_response.mimetype == "text/csv"
    assert b"sku" in csv_response.data.lower()

    pdf_response = client.get("/export/sales.pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.mimetype == "application/pdf"
