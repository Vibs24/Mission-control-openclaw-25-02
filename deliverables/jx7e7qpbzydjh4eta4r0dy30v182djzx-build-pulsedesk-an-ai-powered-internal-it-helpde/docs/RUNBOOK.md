# Incident Runbook
- API latency spike: check Redis saturation and DB slow queries; scale backend deployment.
- WebSocket stale updates: verify pub/sub channel health and reconnect loop.
- Claude triage failures: fail-open to medium priority and log triage error event.
