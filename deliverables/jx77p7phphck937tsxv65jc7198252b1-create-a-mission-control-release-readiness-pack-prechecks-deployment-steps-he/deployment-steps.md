# Deployment Steps

1. Announce deployment start in ops channel.
2. Take final DB/app backup snapshot.
3. Deploy OpenClaw update and restart gateway (`openclaw gateway restart`).
4. Deploy bot service update.
5. Deploy dashboard release.
6. Run health checks and smoke checklist.
7. Observe 15-minute stabilization window.
8. Mark release complete only if all checks PASS.
