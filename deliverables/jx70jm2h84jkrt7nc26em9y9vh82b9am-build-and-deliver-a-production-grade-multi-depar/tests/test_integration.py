from tests.conftest import login

def test_employee_create_and_export(client):
    login(client,'manager1','manager123')
    rv=client.post('/employees',data={'emp_code':'E777','name':'Test User','email':'t@x.com','phone':'1','department_id':1,'title':'Ops','salary':12345,'status':'active'},follow_redirects=True)
    assert b'Test User' in rv.data
    ex=client.get('/export/employees.csv')
    assert ex.status_code==200 and b'E777' in ex.data

def test_leave_review_flow(client):
    login(client,'reviewer1','reviewer123')
    client.post('/leaves',data={'employee_id':1,'leave_type':'sick','start_date':'2026-03-10','end_date':'2026-03-11','reason':'flu','status':'pending'},follow_redirects=True)
    login(client,'manager1','manager123')
    rv=client.post('/leaves/1/review',data={'status':'approved'},follow_redirects=True)
    assert b'approved' in rv.data
