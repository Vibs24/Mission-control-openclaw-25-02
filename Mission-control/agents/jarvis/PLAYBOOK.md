# PLAYBOOK.md — Jarvis

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Jarvis)

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
- Task context: [done/approved] Analyze Mission Control last-24h metrics: throughput, median cycle time, blocked -> Completed and approved
- Task context: [done/approved] Simulate a Sev-2 support incident: user login failures and delayed task updates. -> Completed and approved
- Task context: [done/approved] Build a fully functional Employee Operations Dashboard using Flask + SQLite + HT -> Completed via PM parallel workflow
- Task context: [done/approved] Smoke Test: build a minimal Flask + SQLite employee notes app with login, CRUD, and README -> Completed via PM parallel workflow
- Task context: [in_progress/pending] Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder -> PM graph has 1 blocked node(s); chief recovery active
- Activity: Chief moved 'Smoke Test: build a minimal Flask + SQLite employee notes app with login, CRUD, and README' to done
- Activity: Chief moved 'Build a fully functional Employee Operations Dashboard using Flask + SQLite + HT' to done
- Activity: Reviewer rejected review for 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Reviewer commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Reviewer execution completed
- Activity: Documentation commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Documentation execution completed
- Activity: Telegram status sent to 1045407142: digest_15m inbox:0 assigned:0 in_progress:0 review:0 waiting:0 blocked:0 done:6 alerts:0
- Activity: Operations commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Operations execution completed
- Activity: Frontend commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Frontend execution completed
- Activity: Backend commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Backend execution completed
- Activity: Designer commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Designer execution completed
- Activity: Database commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Database execution completed
- Activity: Chief moved 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder' to in_progress
- Activity: Task assigned: Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder

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
