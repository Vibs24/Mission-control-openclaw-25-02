# PulseDesk

AI-powered internal IT helpdesk platform.

## Local setup (<= 5 steps)
1. `cp .env.example .env`
2. `docker compose up -d --build`
3. `docker compose exec backend npm run migrate`
4. Open frontend: `http://localhost:5173`
5. Open API docs: `http://localhost:8080/docs`

## Stack
- Frontend: React + TypeScript + TanStack Query + Recharts + WebSocket
- Backend: Node.js + Express modular REST API
- AI triage: Claude API adapter service
- Data: PostgreSQL + Redis
- Ops: Docker Compose, GitHub Actions, K8s manifests, Prometheus/Grafana, OTel
