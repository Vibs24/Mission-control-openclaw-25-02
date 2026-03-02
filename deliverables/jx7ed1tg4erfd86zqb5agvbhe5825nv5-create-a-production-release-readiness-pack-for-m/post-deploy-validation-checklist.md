# Post-Deploy Validation Checklist

## Core Functional Validation
- [ ] Telegram intake -> task created
- [ ] Task assignment + handoff chain works
- [ ] Reviewer gate behavior intact
- [ ] Artifact folder auto-managed writes successful

## Reliability Validation
- [ ] Controlled retry path works without stuck state
- [ ] Digest cycle runs and includes blocked/stuck reasons
- [ ] Agent utilization widgets/metrics update

## Security & Access
- [ ] Role-based auth works (admin/reviewer/viewer)
- [ ] No privilege escalation observed
- [ ] Sensitive logs/secrets not exposed

## Final Readiness Gate
- [ ] All prechecks and health checks marked PASS
- [ ] Smoke test script passed
- [ ] Rollback readiness confirmed
- [ ] Reviewer signoff recorded
