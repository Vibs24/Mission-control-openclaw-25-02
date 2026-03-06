# Architecture
Frontend SPA (React/TS) communicates with Express REST + WebSocket gateway.
PostgreSQL stores source-of-truth data. Redis handles session cache and pub/sub.
AI triage service classifies and prioritizes inbound tickets.
Observability: structured logs + Prometheus + Grafana + OTel traces.
