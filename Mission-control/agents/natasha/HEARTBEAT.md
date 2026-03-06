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
- [in_progress/pending] Build and deliver an enterprise-grade Mission Control Reliability & Autonomy Upg -> Awaiting Natasha implementation evidence with Output Path/Stored Location after watchdog redispatch

### Special Focus
- Task context: [done/approved] Simulate a Sev-2 support incident: user login failures and delayed task updates. -> Completed and approved
<!-- END MC_SYNC:daily_focus -->
