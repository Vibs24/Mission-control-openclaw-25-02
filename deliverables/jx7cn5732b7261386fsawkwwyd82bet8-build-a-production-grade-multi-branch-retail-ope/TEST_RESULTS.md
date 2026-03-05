# Test Results

Date: 2026-03-05

## Command
```bash
PYTHONPATH=.pydeps:. python3 -m pytest -q
```

## Output
```
10 passed, 783 warnings in 23.45s
```

Warnings are primarily from `datetime.utcnow()` deprecation notices in seed generation and Jinja `now()` usage.
