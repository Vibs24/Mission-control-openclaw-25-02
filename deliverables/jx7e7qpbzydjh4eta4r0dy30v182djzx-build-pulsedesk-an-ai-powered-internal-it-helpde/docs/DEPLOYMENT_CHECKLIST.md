# Deployment Readiness Checklist

- [ ] Python 3.11+ available
- [ ] Virtual env and dependencies installed
- [ ] `SECRET_KEY` overridden with strong secret
- [ ] HTTPS enabled at reverse proxy
- [ ] Regular `retail.db` backup job configured
- [ ] Access control verified for Admin/Manager/Staff
- [ ] Smoke test pages load
- [ ] Automated tests pass in CI
- [ ] App startup and failure logs monitored
- [ ] Storage/permissions allow DB writes
