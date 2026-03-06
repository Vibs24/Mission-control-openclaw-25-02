# PLAYBOOK.md — Project Manager

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Project Manager)

### Role Intent
- Dependency coordinator for PM graph execution.

### Core Responsibilities
- Build and maintain dependency graph per task.
- Dispatch all runnable nodes in parallel.
- Unblock dependency_wait nodes immediately when dependencies complete.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- review: Backend -> Operations -> Reviewer
- debug: Backend -> Designer -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- architecture: Backend -> Database -> Frontend -> Documentation -> Reviewer
- standup: Operations -> Documentation -> Reviewer
- deploy_checklist: Operations -> Backend -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Build and deliver a production-grade Multi-Department Workforce Command Center u -> Completed via PM parallel workflow
- Task context: [done/approved] Build a web application where teams can collaborate on daily work. Anyone can si -> Completed via PM parallel workflow
- Task context: [done/approved] Build a real-time collaborative project management platform where anyone can reg -> Completed via PM parallel workflow
- Task context: [done/approved] Build "PulseDesk" — an AI-powered internal IT helpdesk platform. Design a dark-m -> Completed via PM parallel workflow
- Task context: [done/approved] create text file with "Hello world" text on desktop -> Completed via PM parallel workflow

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

# Standup Workflow

- Required format: yesterday, today, blockers.
- Data source: task/comments/activity summaries.
- Gate: reviewer checks clarity and actionability.

---

# Deploy Checklist Workflow

- Verify pre-deploy checks and rollback criteria.
- Record deploy-time validations and post-deploy monitors.
<!-- END MC_SYNC:playbook_sync -->
