import unittest

from app import build_basic_pdf, calculate_work_hours, paginate, validate_employee_payload


class TestUnitCore(unittest.TestCase):
    def test_calculate_work_hours_valid_range(self):
        self.assertEqual(calculate_work_hours("2026-03-01T09:00:00", "2026-03-01T17:30:00"), 8.5)

    def test_calculate_work_hours_invalid_values(self):
        self.assertEqual(calculate_work_hours("", ""), 0.0)
        self.assertEqual(calculate_work_hours("2026-03-01T12:00:00", "2026-03-01T11:00:00"), 0.0)

    def test_paginate_clamps_requested_page(self):
        page, pages, offset = paginate(total=55, page=99, per_page=10)
        self.assertEqual(page, 6)
        self.assertEqual(pages, 6)
        self.assertEqual(offset, 50)

    def test_validate_employee_payload_requires_fields(self):
        payload = {
            "employee_code": "",
            "full_name": "",
            "email": "",
            "department": "",
            "title": "",
            "status": "Active",
            "hourly_rate": 10,
            "hire_date": "",
        }
        self.assertIsNotNone(validate_employee_payload(payload))

    def test_build_basic_pdf_generates_pdf_binary(self):
        pdf = build_basic_pdf(["hello", "world"])
        self.assertTrue(isinstance(pdf, bytes))
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertIn(b"%%EOF", pdf)


if __name__ == "__main__":
    unittest.main()
