# Troubleshooting

## Login fails
- Re-run `python seed_data.py` and use seeded credentials.

## No stock available for sale
- Record purchase first or increase inventory entry.

## 403 on branch/purchase pages
- Expected for Staff role. Use Admin/Manager.

## PDF export fails
- Ensure `fpdf2` is installed from `requirements.txt`.

## Tests fail due to environment
- Activate venv: `source /tmp/retailops-venv/bin/activate`.
