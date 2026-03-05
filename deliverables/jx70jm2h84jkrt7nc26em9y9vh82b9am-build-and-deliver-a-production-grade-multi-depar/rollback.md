# Rollback Guide
1. Stop app process.
2. Restore last known-good SQLite DB backup (`cp backup/workforce.db instance/workforce.db`).
3. Reset code to previous git commit.
4. Re-run `./healthcheck.sh`.
5. Restart app and validate login + dashboard.
