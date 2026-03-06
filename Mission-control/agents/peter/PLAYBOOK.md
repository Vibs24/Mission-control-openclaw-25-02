# PLAYBOOK.md — Peter

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Peter)

### Role Intent
- Technical documentation specialist.

### Core Responsibilities
- Produce runbooks, README, and operator guidance.
- Attach durable docs required for reviewer signoff.
- Capture final implementation context for handoff.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- architecture: Backend -> Database -> Frontend -> Documentation -> Reviewer
- standup: Operations -> Documentation -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Analyze Mission Control last-24h metrics: throughput, median cycle time, blocked -> Completed and approved
- Task context: [done/approved] Simulate a Sev-2 support incident: user login failures and delayed task updates. -> Completed and approved
- Task context: [done/approved] /BUILD TASK : Podcast Repurposing Studio MVP -> Completed and approved
- Activity: Document created: Execution Context — Reviewer execution completed
- Activity: Documentation commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Documentation execution completed
- Activity: Document created: Execution Context — Operations execution completed
- Activity: Document created: Execution Context — Frontend execution completed
- Activity: Document created: Execution Context — Backend execution completed
- Activity: Document created: Execution Context — Designer execution completed
- Activity: Document created: Execution Context — Database execution completed

### Shared Workflow Templates
# General Workflow

- Post a structured worklog for each execution step.
- Include concrete evidence and blockers.
- Provide explicit next handoff owner.

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

# Standup Workflow

- Required format: yesterday, today, blockers.
- Data source: task/comments/activity summaries.
- Gate: reviewer checks clarity and actionability.
<!-- END MC_SYNC:playbook_sync -->
