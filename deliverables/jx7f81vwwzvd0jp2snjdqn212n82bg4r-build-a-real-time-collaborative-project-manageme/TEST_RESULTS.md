# TEST_RESULTS

## Run Date
- 2026-03-05

## Command
```bash
./scripts/test.sh
```

## Result
- `10 passed`
- `0 failed`

## Suite Coverage (high level)
- Unit: password hashing/session token issuance, invalid auth rejection
- Integration: workspace creation, invite acceptance, member role change/removal, task lifecycle, notifications read/unread
- Smoke: board UI route rendering
- Export checks: tasks CSV, workload CSV, summary PDF signature

## Notes
- Pytest reports deprecation warnings for `datetime.utcnow()` usage (app + third-party internals).
- Functional behavior passed in full.
