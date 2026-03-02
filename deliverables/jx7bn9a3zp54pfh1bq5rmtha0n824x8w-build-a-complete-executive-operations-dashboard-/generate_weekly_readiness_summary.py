import csv
from collections import defaultdict
from statistics import mean
from datetime import datetime, UTC

DATA = "data/ops_events.csv"
OUT = "weekly_readiness_summary.md"

rows = []
with open(DATA, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        r["week"] = int(r["week"])
        r["incidents"] = int(r["incidents"])
        r["reopened_failures"] = int(r["reopened_failures"])
        r["review_turnaround_hours"] = float(r["review_turnaround_hours"])
        r["tasks_completed"] = int(r["tasks_completed"])
        r["tasks_failed"] = int(r["tasks_failed"])
        rows.append(r)

latest = max(r["week"] for r in rows)
week_rows = [r for r in rows if r["week"] == latest]
completed = sum(r["tasks_completed"] for r in week_rows)
failed = sum(r["tasks_failed"] for r in week_rows)
incidents = sum(r["incidents"] for r in week_rows)
reopened = sum(r["reopened_failures"] for r in week_rows)
review_avg = mean(r["review_turnaround_hours"] for r in week_rows)
reliability = completed / (completed + failed) * 100

readiness = "GREEN"
if incidents >= 3 or reopened >= 4 or review_avg > 7 or reliability < 85:
    readiness = "AMBER"
if incidents >= 5 or reopened >= 6 or review_avg > 9 or reliability < 75:
    readiness = "RED"

with open(OUT, "w", encoding="utf-8") as f:
    f.write(f"# Weekly Readiness Summary (Week {latest})\n\n")
    f.write(f"Generated: {datetime.now(UTC).isoformat()} UTC\n\n")
    f.write(f"- Overall Readiness: **{readiness}**\n")
    f.write(f"- Tasks Completed: **{completed}**\n")
    f.write(f"- Tasks Failed: **{failed}**\n")
    f.write(f"- Reliability: **{reliability:.2f}%**\n")
    f.write(f"- Incidents: **{incidents}**\n")
    f.write(f"- Reopened Failures: **{reopened}**\n")
    f.write(f"- Avg Review Turnaround: **{review_avg:.2f}h**\n\n")
    f.write("## Recommendations\n")
    if readiness == "GREEN":
        f.write("- Maintain current cadence and continue weekly reliability checks.\n")
    elif readiness == "AMBER":
        f.write("- Prioritize recurrence hotspots and reduce review queue aging.\n")
    else:
        f.write("- Trigger incident command and enforce stabilization sprint.\n")
print("weekly readiness summary generated")
