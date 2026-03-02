# Health Checks

## OpenClaw / Orchestrator
- [ ] `openclaw status` returns healthy
- [ ] Gateway reachable and processing turns
- [ ] Orchestrator process restarted cleanly and logs show no crash loop

## Bot Intake
- [ ] Bot receives test message
- [ ] Task creation path responds within SLA
- [ ] Digest scheduler still active

## Dashboard
- [ ] Login works for expected roles
- [ ] Live board loads and updates
- [ ] CSV export endpoint returns data

## Data Integrity
- [ ] No unexpected migration errors
- [ ] Recent tasks visible and not duplicated
- [ ] Artifact folder writes succeed

## Alerting
- [ ] Pager/alerts remain connected
- [ ] No critical unresolved alarms after stabilization window
