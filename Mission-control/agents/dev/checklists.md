# checklists.md — Dev

<!-- BEGIN MC_SYNC:checklists_sync -->
## Checklist Pack (Dev)

Use these checklists before handoff/review:

### general
- Post a structured worklog for each execution step.
- Include concrete evidence and blockers.
- Provide explicit next handoff owner.

### review
- Scope: Security, performance, correctness, maintainability.
- Required output: structured findings with severity and evidence.
- Gate: reviewer approval after proof validation.

### debug
- Steps: reproduce -> isolate -> diagnose -> fix.
- Required output: root cause, fix, prevention notes.
- Gate: evidence-backed worklog and reviewer decision.

### incident
- Steps: triage severity -> communicate -> mitigate -> stabilize -> postmortem notes.
- Required output: timeline, impact, mitigation actions, next updates.
- Gate: reviewer confirms incident evidence completeness.

### architecture
- Steps: context -> options -> tradeoffs -> decision.
- Required output: ADR-style decision record with consequences.
- Gate: reviewer confirms assumptions and decision completeness.

### standup
- Required format: yesterday, today, blockers.
- Data source: task/comments/activity summaries.
- Gate: reviewer checks clarity and actionability.

### deploy_checklist
- Verify pre-deploy checks and rollback criteria.
- Record deploy-time validations and post-deploy monitors.
<!-- END MC_SYNC:checklists_sync -->
