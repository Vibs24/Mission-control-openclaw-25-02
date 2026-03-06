# PLAYBOOK.md — Backend

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Backend)

### Role Intent
- Service/API implementation specialist.

### Core Responsibilities
- Implement backend logic and integration behavior.
- Provide runnable evidence with concrete output artifacts.
- Coordinate with Database/Frontend dependencies.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- review: Backend -> Operations -> Reviewer
- debug: Backend -> Designer -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- architecture: Backend -> Database -> Frontend -> Documentation -> Reviewer
- deploy_checklist: Operations -> Backend -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Build and deliver a production-grade Multi-Department Workforce Command Center u -> Completed via PM parallel workflow
- Task context: [done/approved] Build a real-time collaborative project management platform where anyone can reg -> Completed via PM parallel workflow

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

# Architecture Workflow

- Steps: context -> options -> tradeoffs -> decision.
- Required output: ADR-style decision record with consequences.
- Gate: reviewer confirms assumptions and decision completeness.

---

# Deploy Checklist Workflow

- Verify pre-deploy checks and rollback criteria.
- Record deploy-time validations and post-deploy monitors.
<!-- END MC_SYNC:playbook_sync -->
