# TEST_RESULTS

Execution date: 2026-03-05
Environment: offline (pip index unreachable), Python from system + `.venv` shell, `PYTHONPATH=.pydeps` fallback enabled.

## 1) Setup

Command:

```bash
./scripts/setup.sh
```

Result: PASS (setup completed; dependency install fell back due offline environment)

Key output:

```text
[setup] WARNING: dependency install failed. Continuing with system Python packages and PYTHONPATH=.pydeps
[setup] initializing and seeding database
Seed complete.
[setup] complete
```

## 2) Seed Reset

Command:

```bash
PYTHONPATH="$(pwd)/.pydeps:${PYTHONPATH:-}" python3 scripts/seed.py --reset
```

Result: PASS

Key output:

```text
Seed complete.
```

## 3) Automated Test Suite (Unit + Integration + Smoke)

Command:

```bash
./scripts/test.sh
```

Result: PASS

Key output:

```text
[test] pytest not available, using unittest discovery fallback
Ran 13 tests in 11.843s
OK
```

Detailed executed tests:

```text
test_admin_can_create_employee ... ok
test_login_logout_flow ... ok
test_manager_creates_leave_reviewer_approves ... ok
test_reviewer_cannot_open_employee_create ... ok
test_dashboard_after_login ... ok
test_dashboard_requires_auth ... ok
test_health_endpoint ... ok
test_payroll_exports ... ok
test_build_basic_pdf_generates_pdf_binary ... ok
test_calculate_work_hours_invalid_values ... ok
test_calculate_work_hours_valid_range ... ok
test_paginate_clamps_requested_page ... ok
test_validate_employee_payload_requires_fields ... ok
```

## 4) Health Check

Command:

```bash
./scripts/healthcheck.sh --internal
```

Result: PASS

Key output:

```text
HEALTHCHECK_PASS internal status=ok database=ok timestamp=2026-03-05T07:10:50.170064Z
```

## 5) Deploy + Rollback Smoke

Commands:

```bash
./scripts/deploy.sh /tmp/workforce_deploy_smoke
sleep 1
./scripts/deploy.sh /tmp/workforce_deploy_smoke
./scripts/rollback.sh /tmp/workforce_deploy_smoke
```

Result: PASS

Key output:

```text
Deployed release: /tmp/workforce_deploy_smoke/releases/20260305_124008
Deployed release: /tmp/workforce_deploy_smoke/releases/20260305_124013
Rollback complete. Current now points to: /tmp/workforce_deploy_smoke/releases/20260305_124008
```

## 6) Known Execution Constraint

Command attempted:

```bash
./scripts/run.sh
```

Observed sandbox limitation:

```text
Operation not permitted
```

Notes: runtime app start is blocked by sandbox port-binding restrictions in this environment. Functional runtime validation was completed using Flask test client and internal health checks.
