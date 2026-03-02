# Rollback Plan

## Triggers
- 5xx rate exceeds threshold for 5 minutes
- Bot intake unavailable > 3 minutes
- Auth regression or permission break
- Data integrity issues (missing/duplicated tasks)

## Procedure
1. Declare rollback.
2. Revert to prior release artifact/tag.
3. Restore prior config/secrets snapshot (if changed).
4. Restart OpenClaw/bot/dashboard services.
5. Restore DB snapshot if required.
6. Re-run health checks + smoke checklist.
7. Publish rollback report and next steps.
