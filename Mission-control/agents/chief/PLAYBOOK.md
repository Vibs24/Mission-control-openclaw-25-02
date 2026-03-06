# PLAYBOOK.md — Chief

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Chief)

### Role Intent
- Final orchestration authority. Owns triage, policy enforcement, escalation, and recovery.

### Core Responsibilities
- Classify intake, select orchestration model, and enforce guardrails.
- Monitor node/step health and intervene on stalls.
- Never count chief notes as specialist proof.

### Workflow Ownership
- general: Backend -> Frontend -> Database -> Designer -> Documentation -> Operations -> Reviewer
- review: Backend -> Operations -> Reviewer
- debug: Backend -> Designer -> Operations -> Reviewer
- incident: Operations -> Backend -> Database -> Documentation -> Reviewer
- architecture: Backend -> Database -> Frontend -> Documentation -> Reviewer
- standup: Operations -> Documentation -> Reviewer
- deploy_checklist: Operations -> Backend -> Reviewer

### Current Focus Deltas
- Task context: [done/approved] Build a web application where teams can collaborate on daily work. Anyone can si -> Completed via PM parallel workflow
- Task context: [done/approved] Build a real-time collaborative project management platform where anyone can reg -> Completed via PM parallel workflow
- Task context: [done/approved] Build "PulseDesk" — an AI-powered internal IT helpdesk platform. Design a dark-m -> Completed via PM parallel workflow
- Activity: Chief moved 'create text file with "Hello world" text on desktop' to done
- Activity: Chief moved 'Build "PulseDesk" — an AI-powered internal IT helpdesk platform. Design a dark-m' to done
- Activity: Chief moved 'Build a real-time collaborative project management platform where anyone can reg' to done
- Activity: Chief moved 'Build a web application where teams can collaborate on daily work. Anyone can si' to done
- Activity: Chief moved 'Build and deliver a production-grade Multi-Department Workforce Command Center u' to done
- Activity: Telegram status sent to 1045407142: digest_15m inbox:0 assigned:0 in_progress:0 review:0 waiting:0 blocked:0 done:5 alerts:0

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
