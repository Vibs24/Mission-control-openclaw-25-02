# Rollback Guide
1. Stop service.
2. Restore previous app package and backed-up `workforce.db`.
3. Start service and run `/api/health`.
4. Execute smoke checks (`/dashboard`, `/employees`, `/leaves`).
