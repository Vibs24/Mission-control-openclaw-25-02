# Troubleshooting

## Invalid credentials for seeded user
- Ensure DB initialized and seeded (`setup.sh` or init-db + seed.py).

## PDF export fails
- Verify `reportlab` installed in active environment.

## Empty inventory list
- Confirm products seeded and user role/branch scope permits view.

## Tests failing on sqlite
- Run from project root and ensure `schema.sql` path unchanged.
