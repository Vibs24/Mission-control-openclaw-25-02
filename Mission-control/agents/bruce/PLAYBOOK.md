# PLAYBOOK.md — Bruce

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Bruce)

### Role Intent
- Reliability and deployment specialist.

### Core Responsibilities
- Own operational safety, deploy checks, and mitigation strategy.
- Publish stability findings and recovery plans.
- Gate readiness before reviewer step.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- review: Backend -> Operations -> Reviewer
- debug: Backend -> Designer -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- standup: Operations -> Documentation -> Reviewer
- deploy_checklist: Operations -> Backend -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Analyze Mission Control last-24h metrics: throughput, median cycle time, blocked -> Completed and approved
- Task context: [done/approved] Build a simple mission status dashboard (HTML/CSS) with README and sample data -> Completed and approved
- Task context: [done/approved] Build a fully functional Employee Operations Dashboard using Flask + SQLite + HT -> Completed via PM parallel workflow

### Shared Workflow Templates
# General Workflow

- Post a structured worklog for each execution step.
- Include concrete evidence and blockers.
- Provide explicit next handoff owner.

---

# Review Workflow

- Scope: Security, performance, correctness, maintainability.
- Required output: structured findings with severity and evidence.
- Gate: reviewer approval after proof validation.

---

# Debug Workflow

- Steps: reproduce -> isolate -> diagnose -> fix.
- Required output: root cause, fix, prevention notes.
- Gate: evidence-backed worklog and reviewer decision.

---

# Incident Workflow

- Steps: triage severity -> communicate -> mitigate -> stabilize -> postmortem notes.
- Required output: timeline, impact, mitigation actions, next updates.
- Gate: reviewer confirms incident evidence completeness.

---

# Standup Workflow

- Required format: yesterday, today, blockers.
- Data source: task/comments/activity summaries.
- Gate: reviewer checks clarity and actionability.

---

# Deploy Checklist Workflow

- Verify pre-deploy checks and rollback criteria.
- Record deploy-time validations and post-deploy monitors.
<!-- END MC_SYNC:playbook_sync -->
