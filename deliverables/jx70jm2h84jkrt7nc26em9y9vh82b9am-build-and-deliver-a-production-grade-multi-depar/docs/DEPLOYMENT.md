# Deployment Script Notes
1. Provision host with Python 3.11+.
2. Run `./scripts/setup.sh`.
3. Serve via process manager (systemd/gunicorn) behind HTTPS reverse proxy.
4. Run `./scripts/test.sh` as pre-deploy gate.
