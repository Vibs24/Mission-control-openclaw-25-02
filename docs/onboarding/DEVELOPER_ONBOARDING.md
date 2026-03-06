# Developer Onboarding

1. `cp .env.example .env`
2. `npm install`
3. `docker compose up -d postgres redis`
4. `npm run dev -w @pulsedesk/api` and `npm run dev -w @pulsedesk/web`
5. Run tests via `npm test`

Architecture: apps/api (Express), apps/web (React), infra/ (ops).
