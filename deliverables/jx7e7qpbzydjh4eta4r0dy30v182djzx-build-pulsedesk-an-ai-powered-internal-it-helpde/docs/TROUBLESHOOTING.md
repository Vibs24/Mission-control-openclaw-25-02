# Troubleshooting

## Login fails for demo users
- Ensure setup was run: `bash scripts/setup.sh`.
- Verify DB exists and seeded: `ls retail.db` and call `/seed`.

## `ModuleNotFoundError`
- Activate venv: `source .venv/bin/activate`
- Reinstall deps: `pip install -r requirements.txt`

## PDF generation error
- Ensure `reportlab` installed in active venv.

## SQLite lock errors
- Avoid multiple write-heavy processes against same DB file.
- Restart app and retry.

## Empty dashboard values
- Create sales from `/sales/new` to populate KPI metrics.
