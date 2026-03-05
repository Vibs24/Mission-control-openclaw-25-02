import unittest

from support import build_test_app, cleanup_temp_dir


class TestSmokeEndpoints(unittest.TestCase):
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

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["database"], "ok")

    def test_dashboard_requires_auth(self):
        response = self.client.get("/dashboard", follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Secure Login", response.data)

    def test_dashboard_after_login(self):
        self.login("admin", "admin123")
        response = self.client.get("/dashboard")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Multi-Department Workforce Dashboard", response.data)

    def test_payroll_exports(self):
        self.login("admin", "admin123")
        csv_resp = self.client.get("/exports/payroll.csv")
        pdf_resp = self.client.get("/exports/payroll.pdf")

        self.assertEqual(csv_resp.status_code, 200)
        self.assertEqual(csv_resp.mimetype, "text/csv")
        self.assertIn(b"employee_code", csv_resp.data)

        self.assertEqual(pdf_resp.status_code, 200)
        self.assertEqual(pdf_resp.mimetype, "application/pdf")
        self.assertTrue(pdf_resp.data.startswith(b"%PDF-"))


if __name__ == "__main__":
    unittest.main()
