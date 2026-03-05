# Health Checks
- App liveness: GET /docs/health
- DB connectivity: SQL `select 1` via health route
- Expected response: {"status":"ok","db":"reachable"}
