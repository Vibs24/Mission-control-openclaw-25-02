from tests.conftest import login


def test_smoke_pages(client):
    login(client, 'admin', 'admin123')
    for path in ['/dashboard', '/inventory', '/sales', '/customers', '/vendors', '/notifications', '/audit']:
        rv = client.get(path)
        assert rv.status_code == 200
