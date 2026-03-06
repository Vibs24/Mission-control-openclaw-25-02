# Incident Runbooks

## API latency spike
1. Check `/metrics` and p95 histogram.
2. Inspect DB connections and slow query logs.
3. Scale API deployment + Redis if pub/sub lagging.

## WebSocket disconnect storm
1. Verify ingress idle timeout settings.
2. Roll restart API pods to clear stale WS sessions.
3. Confirm Redis pub/sub fanout health.
