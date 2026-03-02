# Executive Operations Dashboard

Flask dashboard with KPI tiles, trend analysis, failure recurrence graph, review turnaround metrics, agent reliability scorecards, and weekly readiness summary generation.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 generate_weekly_readiness_summary.py
flask --app app run --debug
```

Open: http://127.0.0.1:5000

## Outputs
- Dashboard UI: `/`
- API summary: `/api/summary`
- Weekly readiness report: `weekly_readiness_summary.md`
