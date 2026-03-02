# Rollback Plan

## Rollback Triggers (Hard)
- Sustained 5xx over threshold (>=1% for 5 min)
- Bot intake outage > 3 minutes
- Data corruption symptoms (missing/duplicated tasks)
- Authentication failures or permission regression

## Rollback Procedure
1. Declare rollback in ops channel with timestamp.
2. Revert to previous release artifact/tag.
3. Restore prior config + secrets snapshot if changed.
4. Restart services (`openclaw gateway restart`, bot, dashboard).
5. If data impacted, restore DB snapshot and replay safe events.
6. Re-run smoke tests and core health checks.
7. Publish incident summary and next-action plan.

## Ownership
- Rollback commander: Dev on-call
- Reviewer approval required before re-attempting rollout
