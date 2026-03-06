# Performance Targets

Target: 500 concurrent agents, API p95 < 200ms.

Approach:
- Indexed ticket filters + FTS GIN index
- Redis session cache and event pub/sub fanout
- Horizontal API scaling with HPA
- Keep WS messages compact and stateless
