# Rollout Plan (Phased)

## Phase 0 — Freeze & Backup
1. Freeze deploy branch/tag.
2. Capture DB/app backup and store backup ID.
3. Announce rollout start in ops channel.

## Phase 1 — Controlled Update
1. Deploy OpenClaw/runtime update to canary node.
2. Restart orchestrator/service:
   - `openclaw gateway restart`
3. Verify canary health checks all green.

## Phase 2 — Bot + Dashboard
1. Roll bot intake service update.
2. Roll dashboard release artifact.
3. Validate authentication, intake, and task board rendering.

## Phase 3 — Full Traffic
1. Promote canary to production fleet.
2. Monitor 15–30 min for error spikes and queue growth.
3. Mark deploy complete only after post-deploy checklist pass.

## Abort Conditions
- Auth failures > 2% for 5 min
- Intake queue lag > 2x baseline for 10 min
- Dashboard 5xx > 1% for 5 min
