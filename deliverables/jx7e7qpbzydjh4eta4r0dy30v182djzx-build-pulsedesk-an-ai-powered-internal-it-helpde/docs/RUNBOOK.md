# Runbook

## Start Service
1. `bash scripts/setup.sh` (first run)
2. `bash scripts/run.sh`
3. Access on port 5000.

## Backup
```bash
cp retail.db retail.db.bak.$(date +%F-%H%M%S)
```

## Restore
```bash
cp retail.db.bak.YYYY-MM-DD-HHMMSS retail.db
```

## Seed Refresh
```bash
python scripts/seed.py
```

## Common Ops
- Export inventory CSV from `/inventory` page.
- Export sales CSV from `/sales` page.
- Download invoice PDF from invoice page.
