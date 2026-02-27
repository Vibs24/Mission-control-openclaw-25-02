# Mission Control Orchestrator

Local Node service that connects Telegram intake to Mission Control (Convex) and runs automated orchestration loops for:

- Telegram webhook + polling fallback intake
- Chief Agent triage (Jarvis)
- Specialist dispatch hooks via OpenClaw CLI
- Chief watchdog / stale-task follow-up
- Reviewer gate automation
- Telegram status notifications on task changes

## Start

1. Copy `.env.example` to `.env` and fill required values.
2. Ensure Mission Control Convex backend is running/deployed and `Reviewer` agent exists.
3. Run:

```bash
npm run orchestrator
```

## Notes

- Webhook and polling can run together; Convex intake dedupe prevents duplicate task creation.
- Telegram status notifications are sent for Telegram-sourced tasks only.
- OpenClaw dispatch uses `openclaw agent --agent main` by default. Adjust `OPENCLAW_PROFILE` / `OPENCLAW_BIN` as needed.
- Reviewer decision defaults to a heuristic fallback unless you wire structured reviewer outputs and parse them.
