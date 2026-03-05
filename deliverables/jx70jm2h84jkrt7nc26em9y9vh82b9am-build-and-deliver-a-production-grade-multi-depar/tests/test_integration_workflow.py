from tests.conftest import login


def test_employee_create_and_search(client):
    login(client, "manager", "manager123")
    client.post("/employees/new", data={
        "emp_code": "E2001", "first_name": "Test", "last_name": "User", "department": "QA",
        "email": "test.user@corp.local", "phone": "9999999999", "join_date": "2024-01-01",
        "status": "Active", "base_salary": "50000"
    }, follow_redirects=True)
    r = client.get("/employees?q=E2001")
    assert b"E2001" in r.data


def test_leave_review_flow(client):
    login(client, "manager", "manager123")
    client.post("/leave", data={
        "employee_id": "1", "leave_type": "Sick", "start_date": "2026-03-01", "end_date": "2026-03-02", "reason": "Fever"
    }, follow_redirects=True)
    client.post("/leave/1/review", data={"action": "Approved"}, follow_redirects=True)
    r = client.get("/leave?status=Approved")
    assert b"Approved" in r.data
