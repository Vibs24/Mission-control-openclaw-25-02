# Developer Onboarding
1. Install Docker + Node 20.
2. Copy `.env.example` to `.env`.
3. `docker compose up -d --build`.
4. Run migrations: `docker compose exec backend npm run migrate`.
5. Verify `/health`, frontend UI, and Grafana.
