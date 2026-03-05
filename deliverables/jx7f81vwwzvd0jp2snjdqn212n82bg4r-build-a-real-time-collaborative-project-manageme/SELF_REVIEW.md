# SELF_REVIEW

## Fixed Issues
1. Reworked schema/model naming to required plural tables and added missing fields:
- `activities.old_value/new_value`
- `notifications.is_read/read_at`
- `session_tokens.expires_at/last_seen_at`

2. Added persistent auth restoration from `session_token` cookie in middleware.

3. Completed workspace and invite flow:
- workspace switcher
- invite generation by email
- invite token acceptance route

4. Implemented admin member controls + workload summary by status.

5. Upgraded board/task UX to meet spec:
- 4 colored status columns with count badges
- card metadata (priority dot, overdue style, avatar initials, comment count)
- drag/drop updates via fetch API
- full-screen task modal
- threaded comments with reply support
- activity diff timeline in UI

6. Added top-nav interactions:
- live search
- notification panel with unread/read + mark-all
- avatar dropdown menu

7. Added presence simulation using recent `session_tokens.last_seen_at`.

8. Added export endpoints:
- `/export/tasks.csv`
- `/export/workload.csv`
- `/export/summary.pdf`

9. Expanded automated tests from a minimal set to 10 passing tests across unit/integration/smoke.

10. Fixed test fixture isolation bug that leaked authenticated state across test clients by adjusting `tests/conftest.py` context lifecycle.

## Remaining Technical Debt
- Replace internal `datetime.utcnow()` calls with timezone-aware UTC (`datetime.now(UTC)`) to remove deprecation warnings under Python 3.14.
