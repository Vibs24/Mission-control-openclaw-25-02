from tests.conftest import login


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["database"] is True


def test_exports(client):
    login(client, "admin", "admin123")
    csv_r = client.get("/export/payroll.csv?month=2026-03")
    assert csv_r.status_code == 200
    assert csv_r.headers["Content-Type"].startswith("text/csv")
    pdf_r = client.get("/export/audit.pdf")
    assert pdf_r.status_code == 200
    assert "application/pdf" in pdf_r.headers["Content-Type"]
