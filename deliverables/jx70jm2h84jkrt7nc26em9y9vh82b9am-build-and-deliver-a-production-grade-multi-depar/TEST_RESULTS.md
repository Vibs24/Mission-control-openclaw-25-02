# Test Results

## setup.sh output
```

[notice] A new release of pip is available: 25.3 -> 26.0.1
[notice] To update, run: python3.14 -m pip install --upgrade pip
Seeded users: admin/admin123 manager/manager123 reviewer/review123
Setup complete
```

## test.sh output
```
..........                                                               [100%]
=============================== warnings summary ===============================
tests/test_integration.py::test_create_employee_flow
tests/test_integration.py::test_create_employee_flow
tests/test_integration.py::test_payroll_export
tests/test_smoke.py::test_login_dashboard
tests/test_smoke_endpoints.py::test_exports
tests/test_unit_auth.py::test_login_success
  /private/tmp/workforce-jx70-venv/lib/python3.14/site-packages/sqlalchemy/sql/schema.py:3624: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    return util.wrap_callable(lambda ctx: fn(), fn)  # type: ignore

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
10 passed, 6 warnings in 1.91s
```
