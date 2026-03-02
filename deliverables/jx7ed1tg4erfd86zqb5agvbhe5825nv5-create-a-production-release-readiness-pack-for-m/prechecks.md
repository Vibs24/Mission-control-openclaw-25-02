# Pre-Deploy Checks (Pass/Fail)

## A) Change Control
- [ ] Release tag/commit SHA frozen and recorded
- [ ] Changelog + risk notes reviewed
- [ ] Reviewer signoff captured

## B) Environment + Secrets
- [ ] Production env vars present (`OPENCLAW_*`, bot token, dashboard keys)
- [ ] Secret rotation status verified (not expired)
- [ ] Time sync/NTP healthy

## C) Data + Storage
- [ ] DB backup snapshot created and verified restorable
- [ ] Disk free space > 20%
- [ ] Migration plan reviewed (if any)

## D) Runtime Readiness
- [ ] `openclaw status` healthy before deployment
- [ ] Node/npm/python versions match baseline
- [ ] Alerting channels reachable

## E) Operational Guardrails
- [ ] Rollback owner assigned
- [ ] Incident commander and reviewer on-call
- [ ] Maintenance window approved

## Evidence to attach
- command outputs (status/version), backup ID, release SHA, reviewer initials + timestamp.
