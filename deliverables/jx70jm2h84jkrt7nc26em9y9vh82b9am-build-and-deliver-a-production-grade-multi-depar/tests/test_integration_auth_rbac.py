import unittest

from support import build_test_app, cleanup_temp_dir


class TestIntegrationAuthRbac(unittest.TestCase):
    def setUp(self):
        self.app, self.temp_dir = build_test_app()
        self.client = self.app.test_client()

    def tearDown(self):
        cleanup_temp_dir(self.temp_dir)

    def login(self, username, password):
        return self.client.post(
            "/login",
            data={"username": username, "password": password},
            follow_redirects=True,
        )

    def test_login_logout_flow(self):
        response = self.login("admin", "admin123")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Multi-Department Workforce Dashboard", response.data)

        response = self.client.post("/logout", follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Secure Login", response.data)

    def test_reviewer_cannot_open_employee_create(self):
        self.login("reviewer", "reviewer123")
        response = self.client.get("/employees/new")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_employee(self):
        self.login("admin", "admin123")
        response = self.client.post(
            "/employees/new",
            data={
                "employee_code": "EMP200",
                "full_name": "Created User",
                "email": "created.user@example.com",
                "department": "Finance",
                "title": "Analyst",
                "status": "Active",
                "hourly_rate": "37.50",
                "hire_date": "2025-02-01",
            },
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Employee created.", response.data)
        self.assertIn(b"EMP200", response.data)

    def test_manager_creates_leave_reviewer_approves(self):
        self.login("manager", "manager123")
        create = self.client.post(
            "/leaves/new",
            data={
                "employee_id": "1",
                "leave_type": "Annual",
                "start_date": "2026-03-10",
                "end_date": "2026-03-12",
                "reason": "Vacation",
            },
            follow_redirects=True,
        )
        self.assertEqual(create.status_code, 200)
        self.assertIn(b"Leave request submitted.", create.data)

        self.client.post("/logout", follow_redirects=True)
        self.login("reviewer", "reviewer123")

        leaves_page = self.client.get("/leaves")
        self.assertEqual(leaves_page.status_code, 200)
        self.assertIn(b"Test Employee", leaves_page.data)
        self.assertIn(b"Pending", leaves_page.data)

        review = self.client.post(
            "/leaves/1/review",
            data={"action": "approve", "review_note": "Looks good"},
            follow_redirects=True,
        )
        self.assertEqual(review.status_code, 200)
        self.assertIn(b"Leave request approved.", review.data)


if __name__ == "__main__":
    unittest.main()
