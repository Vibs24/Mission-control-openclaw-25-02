# Incident Runbook
## API latency >200ms p95
- Check Grafana latency panel.
- Inspect slow SQL and Redis saturation.
- Scale backend pods and cache hot routes.
## WebSocket disconnect storm
- Check LB idle timeout + ws server health.
- Restart ws deployment if memory leak detected.
