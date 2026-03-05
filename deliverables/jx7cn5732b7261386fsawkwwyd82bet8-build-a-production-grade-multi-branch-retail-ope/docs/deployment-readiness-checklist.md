# Deployment Readiness Checklist

- [ ] Replace default `SECRET_KEY`
- [ ] Move from SQLite to managed DB for production scale
- [ ] Run behind Gunicorn + reverse proxy (Nginx/Caddy)
- [ ] Enable HTTPS/TLS
- [ ] Set backup/restore policy
- [ ] Add centralized app/access logging
- [ ] Configure health checks and monitoring
- [ ] Run full test suite before release
- [ ] Validate least-privilege role assignments
- [ ] Confirm runbook/troubleshooting docs are up to date
