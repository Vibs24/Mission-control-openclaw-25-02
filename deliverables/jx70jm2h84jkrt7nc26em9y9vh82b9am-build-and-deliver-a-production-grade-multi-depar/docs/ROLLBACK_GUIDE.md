# Rollback Guide

## Purpose

Restore prior deployment quickly if a release fails validation.

## Prerequisites

- `scripts/deploy.sh` has been used at least once
- `deployments/previous_release.txt` exists

## Rollback Steps

1. Run rollback:

```bash
./scripts/rollback.sh
```

2. Verify current target:

```bash
readlink deployments/current
```

3. Execute health check:

```bash
./scripts/healthcheck.sh
```

4. If database rollback is required, restore a backup from:

- `deployments/backups/workforce_*.db`

## Validation Checklist

- `/health` returns `status=ok` and `database=ok`
- Login succeeds for seeded/admin account
- Dashboard and one CRUD flow load successfully
- Payroll export endpoints return files

## Failure Cases

- `No previous release recorded`: no prior deploy metadata
- `Previous release path missing`: release directory deleted or moved

In either case, perform manual symlink correction or redeploy a known-good release.

