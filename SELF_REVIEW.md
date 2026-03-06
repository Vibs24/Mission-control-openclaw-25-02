# SELF_REVIEW

## Bugs/edge cases found and fixed
1. **Auth seed hash mismatch**
   - Symptom: ticket integration test failed with 401 after login.
   - Fix: replaced seeded bcrypt hash with a valid hash for `password123`.

2. **Workspace test runner resolution**
   - Symptom: `vitest: command not found` in workspace scripts.
   - Fix: executed vitest via explicit local module path and documented stable commands in README/TEST_RESULTS.

3. **TypeScript build errors in middleware/services**
   - Symptom: ESM typing friction for `pino-http` and `ioredis` constructor signatures.
   - Fix: simplified request logger usage in app middleware and used safe cast for Redis constructor.

4. **Legacy folder collisions (`backend`/`frontend`)**
   - Symptom: root workspace build attempted old packages and failed.
   - Fix: removed obsolete folders and standardized on `apps/api` + `apps/web` monorepo structure.

## Known limitations
- Claude integration currently uses explicit safe fallback placeholder when API key exists (integration hook in place, production call should be wired with official SDK/API client and retries).
- Realtime websocket stream currently emits heartbeat-like updates; event fanout from Redis channel is an intended next increment.
