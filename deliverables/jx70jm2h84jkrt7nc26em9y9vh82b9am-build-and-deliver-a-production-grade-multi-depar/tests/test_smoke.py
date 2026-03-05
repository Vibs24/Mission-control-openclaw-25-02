from tests.conftest import login

def test_main_pages(client):
    login(client,'admin','admin123')
    for p in ['/dashboard','/employees','/shifts','/attendance','/leaves','/audit']:
        assert client.get(p).status_code==200
