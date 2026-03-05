# Rollback Guide

1. Stop running service.
2. Restore previous `instance/workforce.db` backup.
3. Revert application code to previous tagged commit.
4. Re-run health check (`scripts/health_check.sh`).
5. Validate login + dashboard + exports.
6. Re-enable traffic after verification.
