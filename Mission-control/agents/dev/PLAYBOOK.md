# PLAYBOOK.md — Dev

<!-- BEGIN MC_SYNC:playbook_sync -->
## Agent Playbook (Dev)

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
- Task context: [done/approved] Build a Flask + SQLite “Asset Register” app with login, asset CRUD, search/filte -> Completed and approved
- Task context: [done/approved] Create a Mission Control release readiness pack: prechecks, deployment steps, he -> Completed and approved
- Task context: [done/approved] /BUILD TASK : Podcast Repurposing Studio MVP -> Completed and approved
- Task context: [done/approved] Build a simple mission status dashboard (HTML/CSS) with README and sample data -> Completed and approved
- Task context: [done/approved] Build a fully functional Employee Operations Dashboard using Flask + SQLite + HT -> Completed via PM parallel workflow
- Task context: [done/approved] Smoke Test: build a minimal Flask + SQLite employee notes app with login, CRUD, and README -> Completed via PM parallel workflow
- Task context: [in_progress/pending] Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder -> PM graph has 1 blocked node(s); chief recovery active
- Activity: Chief moved 'Smoke Test: build a minimal Flask + SQLite employee notes app with login, CRUD, and README' to done
- Activity: Chief moved 'Build a fully functional Employee Operations Dashboard using Flask + SQLite + HT' to done
- Activity: Reviewer rejected review for 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Reviewer commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Documentation commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Operations commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Frontend commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Frontend execution completed
- Activity: Backend commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Backend execution completed
- Activity: Designer commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Database commented on 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: Document created: Execution Context — Database execution completed
- Activity: Chief moved 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder' to in_progress
- Activity: Task assigned: Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder
- Activity: Chief triaged and assigned 'Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder'
- Activity: New task created: Smoke E2E: build minimal HTML status page and README in auto-managed artifact folder (artifact root: /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx74bbk3y7yy887c2zg550d9qx82bg0r-smoke-e2e-build-minimal-html-status-page-and-rea)

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
