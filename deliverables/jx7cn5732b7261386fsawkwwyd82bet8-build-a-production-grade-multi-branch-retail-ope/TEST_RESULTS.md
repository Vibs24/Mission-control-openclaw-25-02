..........                                                               [100%]
=============================== warnings summary ===============================
tests/test_integration.py: 135 warnings
tests/test_smoke.py: 135 warnings
tests/test_unit.py: 180 warnings
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7cn5732b7261386fsawkwwyd82bet8-build-a-production-grade-multi-branch-retail-ope/app.py:1504: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    event_time = (datetime.utcnow() - timedelta(days=day_offset)).strftime(

tests/test_integration.py: 93 warnings
tests/test_smoke.py: 93 warnings
tests/test_unit.py: 124 warnings
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7cn5732b7261386fsawkwwyd82bet8-build-a-production-grade-multi-branch-retail-ope/app.py:1529: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    event_time = (datetime.utcnow() - timedelta(days=day_offset)).strftime(

tests/test_integration.py: 5 warnings
tests/test_smoke.py: 14 warnings
tests/test_unit.py: 4 warnings
  /private/tmp/retail-venv/lib/python3.14/site-packages/jinja2/runtime.py:303: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    return __obj(*args, **kwargs)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
10 passed, 783 warnings in 6.23s
