from tests.conftest import login


def test_public_and_auth_redirects(client):
    public = client.get("/login")
    assert public.status_code == 200

    protected = client.get("/dashboard", follow_redirects=False)
    assert protected.status_code == 302
    assert "/login" in protected.headers["Location"]


def test_admin_smoke_pages(client):
    login(client, "admin", "admin123")
    pages = [
        "/dashboard",
        "/branches",
        "/inventory",
        "/purchases",
        "/sales",
        "/customers",
        "/vendors",
        "/notifications",
        "/audit",
        "/sales/new",
    ]

    for path in pages:
        response = client.get(path)
        assert response.status_code == 200, path


def test_logout_flow(client):
    login(client, "staff_central", "staff123")
    response = client.post("/logout", follow_redirects=True)

    assert response.status_code == 200
    assert b"Secure Login" in response.data
