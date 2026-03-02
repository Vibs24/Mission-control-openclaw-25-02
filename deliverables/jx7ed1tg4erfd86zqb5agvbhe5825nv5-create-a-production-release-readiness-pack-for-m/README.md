# Mission Control Production Release-Readiness Pack

Scope: OpenClaw runtime + bot intake + Mission Control dashboard.

Contents:
- `prechecks.md`
- `rollout-plan.md`
- `health-checks.md`
- `rollback-plan.md`
- `post-deploy-validation-checklist.md`
- `scripts/smoke-test.sh`
- `evidence/release-readiness-gate.md`

Execution model: complete prechecks -> rollout -> health checks + smoke tests -> post-deploy checklist; trigger rollback plan if any hard-fail trigger is met.
