# PLAYBOOK.md — Database

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Database)

### Role Intent
- Schema and persistence specialist.

### Core Responsibilities
- Own schema design, migration readiness, and query safety.
- Attach explicit DB evidence paths for required outputs.
- Escalate data integrity/performance risks early.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- architecture: Backend -> Database -> Frontend -> Documentation -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Build and deliver a production-grade Multi-Department Workforce Command Center u -> Completed via PM parallel workflow
- Task context: [done/approved] Build a web application where teams can collaborate on daily work. Anyone can si -> Completed via PM parallel workflow
- Task context: [done/approved] Build a real-time collaborative project management platform where anyone can reg -> Completed via PM parallel workflow
- Task context: [done/approved] Build "PulseDesk" — an AI-powered internal IT helpdesk platform. Design a dark-m -> Completed via PM parallel workflow

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
<!-- END MC_SYNC:playbook_sync -->
