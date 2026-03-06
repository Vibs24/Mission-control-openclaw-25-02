# PulseDesk Monorepo

AI-powered internal IT helpdesk platform (React + TypeScript frontend, Node/Express backend, Postgres/Redis infra) with realtime ticket updates and operations tooling.

## Local setup (<=5 steps)
1. `cp .env.example .env`
2. `npm install --workspaces`
3. `docker compose up -d postgres redis`
4. In two terminals: `npm run dev -w @pulsedesk/api` and `npm run dev -w @pulsedesk/web`
5. Run tests: `node ../../node_modules/vitest/vitest.mjs run` from `apps/api` and `apps/web`

## Monorepo layout
- `apps/api` - Express modular REST API + WebSocket server + metrics
- `apps/web` - React SPA (dashboard, agent workspace, admin analytics)
- `packages/shared` - shared types
- `infra` - migrations, Docker, k8s, monitoring and telemetry configs
- `docs` - onboarding, ADRs, manuals, runbooks, performance, OpenAPI

## Key capabilities
- Auth and JWT sessions (+ Redis cache integration points)
- Ticket CRUD + triage service (Claude-safe fallback/mock)
- Notification adapter architecture (mock/slack mode)
- Full-text-like search path in app + Postgres FTS in SQL schema
- WebSocket realtime updates for agent UI
- Prometheus `/metrics`, pino structured logging, OTEL collector config
