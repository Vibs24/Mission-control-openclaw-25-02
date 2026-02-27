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
- [done/approved] build fully functional admin dashboard using python -> Execution in progress by Dev, Natasha (restored after backend dispatch fix)
- [done/approved] Create car sales website using html and css -> Completed and approved. Deliverable stored in attached document with output paths.
- [done/approved] create admin dashboard in python -> Awaiting assignee update after chief follow-up
- [done/approved] smoke test: verify anti-stall watchdog for coding task hang -> Regression smoke: force watchdog review auto-submit
- [done/approved] build fully functional bank management dashboard in python -> Completed and approved
- [done/approved] create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch -> Completed and approved

### Special Focus
- Task context: [done/approved] build fully functional admin dashboard using python -> Execution in progress by Dev, Natasha (restored after backend dispatch fix)
- Task context: [done/approved] Create car sales website using html and css -> Completed and approved. Deliverable stored in attached document with output paths.
- Task context: [done/approved] create admin dashboard in python -> Awaiting assignee update after chief follow-up
- Task context: [done/approved] smoke test: verify anti-stall watchdog for coding task hang -> Regression smoke: force watchdog review auto-submit
- Task context: [done/approved] build fully functional bank management dashboard in python -> Completed and approved
- Task context: [done/approved] create login password website using html css and also create db using sqlite -> Completed and approved
- Task context: [done/approved] create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch -> Completed and approved
- Activity: Reviewer approved review for 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch'
- Activity: Jarvis commented on 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch'
- Activity: Chief watchdog auto-submitted 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch' for review after retry dispatch produced evidence-ready progress.
- Activity: Dev commented on 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch'
- Activity: Chief watchdog re-dispatched Dev after stale execution state
- Activity: Automation dispatch triggered for Dev
- Activity: Jarvis moved 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch' to in_progress
- Activity: Jarvis triaged and assigned 'create chatbot for  https://www.sypha.ai/ website clone it locally intergrate ch'
- Activity: Reviewer approved review for 'create login password website using html css and also create db using sqlite'
- Activity: Jarvis commented on 'create login password website using html css and also create db using sqlite'
- Activity: Chief auto-submitted 'create login password website using html css and also create db using sqlite' for review after detecting evidence-ready progress in task comments/docs.
- Activity: Natasha commented on 'create login password website using html css and also create db using sqlite'
- Activity: Jarvis moved 'create login password website using html css and also create db using sqlite' to in_progress
- Activity: Task assigned: create login password website using html css and also create db using sqlite
- Activity: Dev commented on 'create login password website using html css and also create db using sqlite'
- Activity: Jarvis triaged and assigned 'create login password website using html css and also create db using sqlite'
- Activity: Jarvis commented on 'build fully functional bank management dashboard in python'
- Activity: Document created: Bank Dashboard Deliverable (Project-local path)
<!-- END MC_SYNC:daily_focus -->
