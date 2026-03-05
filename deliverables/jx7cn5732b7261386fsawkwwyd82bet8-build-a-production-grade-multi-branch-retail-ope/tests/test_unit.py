from tests.conftest import login


def test_seeded_passwords_are_hashed(app):
    with app.app_context():
        row = app.get_db().execute(
            "SELECT password FROM users WHERE username = ?", ("admin",)
        ).fetchone()
    assert row is not None
    assert row["password"] != "admin123"
    assert "$" in row["password"]


def test_staff_cannot_access_manager_routes(client):
    login(client, "staff_central", "staff123")
    response = client.get("/vendors", follow_redirects=False)
    assert response.status_code == 302
    assert "/dashboard" in response.headers["Location"]


def test_kpi_api_contains_expected_keys(client):
    login(client, "admin", "admin123")
    response = client.get("/api/kpis")
    payload = response.get_json()

    assert response.status_code == 200
    assert set(payload.keys()) == {"daily_sales", "daily_margin", "stock_turnover"}


def test_invoice_pdf_fallback_returns_pdf(client, app):
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
            "WHERE p.branch_id = ? AND i.qty > 5 LIMIT 1",
            (branch_id,),
        ).fetchone()["id"]

    sale_response = client.post(
        "/sales/new",
        data={
            "branch_id": branch_id,
            "customer_id": customer_id,
            "product_id": [str(product_id)],
            "qty": ["1"],
        },
        follow_redirects=True,
    )
    sale_id = int(sale_response.request.path.rsplit("/", 1)[-1])

    app.config["FORCE_PDF_FALLBACK"] = True
    pdf_response = client.get(f"/invoice/{sale_id}.pdf")

    assert pdf_response.status_code == 200
    assert pdf_response.mimetype == "application/pdf"
    assert pdf_response.data.startswith(b"%PDF-")
