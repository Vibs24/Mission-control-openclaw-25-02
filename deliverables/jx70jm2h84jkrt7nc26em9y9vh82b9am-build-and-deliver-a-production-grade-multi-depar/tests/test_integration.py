from conftest import login


def test_admin_can_create_employee_and_department(client):
    login(client, 'admin', 'admin123')
    rv = client.post('/departments', data={'name': 'Finance'}, follow_redirects=True)
    assert rv.status_code == 200
    assert b'Finance' in rv.data


def test_reviewer_forbidden_on_department_management(client):
    login(client, 'reviewer', 'reviewer123')
    rv = client.get('/departments')
    assert rv.status_code == 403


def test_manager_can_create_shift_and_attendance(client):
    login(client, 'manager', 'manager123')
    rv1 = client.post('/shifts', data={'employee_id': '1', 'shift_date': '2026-03-05', 'shift_name': 'Morning', 'start_time': '09:00', 'end_time': '18:00'}, follow_redirects=True)
    assert rv1.status_code == 200
    rv2 = client.post('/attendance', data={'employee_id': '1', 'day': '2026-03-05', 'status': 'Present', 'check_in': '09:00', 'check_out': '18:00'}, follow_redirects=True)
    assert rv2.status_code == 200
