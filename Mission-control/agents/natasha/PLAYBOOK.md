# PLAYBOOK.md — Natasha

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Natasha)

### Role Intent
- Visual/UX specialist.

### Core Responsibilities
- Define layout intent and design checks for implementation.
- Document UX/design constraints and approvals.
- Handoff clear design decisions to dependent nodes.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- debug: Backend -> Designer -> Operations -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Simulate a Sev-2 support incident: user login failures and delayed task updates. -> Completed and approved

### Shared Workflow Templates
# General Workflow

- Post a structured worklog for each execution step.
- Include concrete evidence and blockers.
- Provide explicit next handoff owner.

---

# Debug Workflow

- Steps: reproduce -> isolate -> diagnose -> fix.
- Required output: root cause, fix, prevention notes.
- Gate: evidence-backed worklog and reviewer decision.
<!-- END MC_SYNC:playbook_sync -->
