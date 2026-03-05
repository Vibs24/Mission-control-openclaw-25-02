.............                                                            [100%]
=============================== warnings summary ===============================
tests/test_smoke_endpoints.py::TestSmokeEndpoints::test_health_endpoint
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx70jm2h84jkrt7nc26em9y9vh82b9am-build-and-deliver-a-production-grade-multi-depar/app.py:96: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    "timestamp": datetime.utcnow().isoformat() + "Z",

tests/test_smoke_endpoints.py::TestSmokeEndpoints::test_payroll_exports
tests/test_smoke_endpoints.py::TestSmokeEndpoints::test_payroll_exports
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx70jm2h84jkrt7nc26em9y9vh82b9am-build-and-deliver-a-production-grade-multi-depar/app.py:1043: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
13 passed, 3 warnings in 4.14s
