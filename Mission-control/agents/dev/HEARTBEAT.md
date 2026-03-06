# HEARTBEAT.md — IT Squad Periodic Checks

Run through this checklist every heartbeat cycle. Default Mission Control pattern is a 15-minute heartbeat with staggered start times per agent to avoid all agents waking at once.

## On Wake (All Agents)

- [ ] Read `memory/WORKING.md` first
- [ ] Resume in-progress work if there is an active task
- [ ] Check Mission Control for @mentions
- [ ] Check assigned tasks and recent activity feed
- [ ] If context is unclear, search session memory and today’s daily note

## Jarvis (Lead Agent) — Every Cycle

- [ ] Check Mission Control for new inbox tasks → triage and assign
- [ ] Check for @mentions → respond or delegate
- [ ] Scan activity feed for incidents or blockers
- [ ] Ensure every active task has a clear owner + next action
- [ ] If any task has been in `blocked` for > 1 cycle → escalate to owner
- [ ] If any task has been in `review` for > 2 cycles → ping assignee
- [ ] If nothing urgent: summarize what changed since last heartbeat

## Bruce (IT Analytics) — Every 2 Cycles

- [ ] Check system health metrics (CPU, memory, latency)
- [ ] Check error rates on API gateway and downstream services
- [ ] Check capacity trends (are we approaching any limits?)
- [ ] If any metric is outside normal range → create an incident task and notify Jarvis

## Natasha (IT Support) — Every Cycle

- [ ] Check support ticket queue for new/unassigned tickets
- [ ] Triage new tickets: classify, set priority, assign
- [ ] Check for recurring patterns (same issue 3+ times → escalate to Steve)
- [ ] Update status on in-progress tickets

## Peter (IT Documentation) — Every 4 Cycles

- [ ] Check for tasks in `done` that lack documentation
- [ ] Check for outdated runbooks (last updated > 30 days on active issues)
- [ ] If new incident was resolved → draft incident summary doc

## Steve (Stability & Ops) — Every 2 Cycles

- [ ] Check change management calendar for upcoming changes
- [ ] Check if any post-mortem is overdue (incident resolved but no post-mortem created)
- [ ] Check SLA compliance report
- [ ] Verify Known Issues Runbook is current

## Incident Response

When an incident is detected by any agent:

1. **Create task** with priority: urgent, label: incident
2. **Assign** Natasha (support lead) + Bruce (if infrastructure)
3. **Notify** Jarvis via @mention
4. **Post** initial findings as first comment within 15 minutes
5. **Update** task status every heartbeat until resolved
6. **Post-mortem**: Steve creates within 24 hours of resolution

## Standing Checks (All Agents)

Run these once per day:

- [ ] Are all your assigned tasks up to date?
- [ ] Is WORKING.md current?
- [ ] Did you update today's daily log (`memory/YYYY-MM-DD.md`)?
- [ ] Any tasks you can move forward with available information?

## If No Work

- [ ] Reply `HEARTBEAT_OK`
- [ ] Scan activity feed for places where your expertise can help
- [ ] Add useful context to tasks even if you are not the primary assignee

<!-- BEGIN MC_SYNC:daily_focus -->
## Daily Heartbeat Focus

### Must-Do Items
- [done/approved] Build a Flask + SQLite “Asset Register” app with login, asset CRUD, search/filte -> Completed and approved
- [done/approved] Create a Mission Control release readiness pack: prechecks, deployment steps, he -> Completed and approved
- [done/approved] /BUILD TASK : Podcast Repurposing Studio MVP -> Completed and approved
- [done/approved] Build a simple mission status dashboard (HTML/CSS) with README and sample data -> Completed and approved

### Special Focus
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
<!-- END MC_SYNC:daily_focus -->
