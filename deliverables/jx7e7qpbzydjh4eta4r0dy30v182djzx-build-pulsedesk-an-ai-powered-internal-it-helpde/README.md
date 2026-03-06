# PulseDesk
AI-powered internal IT helpdesk platform.

## Local setup (<=5 steps)
1. `cp .env.example .env`
2. `docker compose up -d --build`
3. `docker compose exec backend npm run migrate`
4. Open frontend: `http://localhost:5173`
5. Open Grafana: `http://localhost:3001`

## Stack
- Frontend: React + TypeScript + TanStack Query + Recharts + WebSockets
- Backend: Node.js + Express + PostgreSQL + Redis
- AI: Claude API for triage/classification/prioritization
- Observability: Prometheus, Grafana, OpenTelemetry

## SLO target
- 500 concurrent agents
- p95 API latency < 200ms

See `docs/` for onboarding, OpenAPI, ADRs, runbooks, and user manual.
