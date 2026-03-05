# Deployment Readiness Checklist

- [ ] Replace default Flask `SECRET_KEY`.
- [ ] Move from plain-text passwords to hashed passwords (Werkzeug hashing).
- [ ] Configure reverse proxy (Nginx/Caddy) + HTTPS.
- [ ] Backup/restore policy for SQLite or migrate to managed DB.
- [ ] Enable process supervision (systemd/supervisor).
- [ ] Restrict debug mode in production.
- [ ] Set log rotation and alerting policy.
- [ ] Execute smoke tests post-deploy.
