from __future__ import annotations
import csv
import json
from collections import defaultdict
from datetime import datetime
from statistics import mean
from flask import Flask, render_template, jsonify

app = Flask(__name__)
DATA_FILE = "data/ops_events.csv"


def load_events():
    rows = []
    with open(DATA_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            r["week"] = int(r["week"])
            r["incidents"] = int(r["incidents"])
            r["reopened_failures"] = int(r["reopened_failures"])
            r["reviews_completed"] = int(r["reviews_completed"])
            r["review_turnaround_hours"] = float(r["review_turnaround_hours"])
            r["tasks_completed"] = int(r["tasks_completed"])
            r["tasks_failed"] = int(r["tasks_failed"])
            rows.append(r)
    return rows


def aggregate(events):
    latest_week = max(e["week"] for e in events)
    latest = [e for e in events if e["week"] == latest_week]

    total_completed = sum(e["tasks_completed"] for e in latest)
    total_failed = sum(e["tasks_failed"] for e in latest)
    total_incidents = sum(e["incidents"] for e in latest)
    avg_review = round(mean(e["review_turnaround_hours"] for e in latest), 2)
    reliability = round((total_completed / max(total_completed + total_failed, 1)) * 100, 2)

    by_week_completed = defaultdict(int)
    by_week_failed = defaultdict(int)
    by_week_reopened = defaultdict(int)
    by_week_review = defaultdict(list)

    per_agent = defaultdict(lambda: {"completed": 0, "failed": 0, "review_turnaround": []})

    for e in events:
        w = e["week"]
        by_week_completed[w] += e["tasks_completed"]
        by_week_failed[w] += e["tasks_failed"]
        by_week_reopened[w] += e["reopened_failures"]
        by_week_review[w].append(e["review_turnaround_hours"])

        a = per_agent[e["agent"]]
        a["completed"] += e["tasks_completed"]
        a["failed"] += e["tasks_failed"]
        a["review_turnaround"].append(e["review_turnaround_hours"])

    weeks = sorted(by_week_completed.keys())
    trend = {
        "weeks": weeks,
        "completed": [by_week_completed[w] for w in weeks],
        "failed": [by_week_failed[w] for w in weeks],
    }
    recurrence = {"weeks": weeks, "reopened": [by_week_reopened[w] for w in weeks]}
    turnaround = {
        "weeks": weeks,
        "avg_hours": [round(mean(by_week_review[w]), 2) if by_week_review[w] else 0 for w in weeks],
    }

    scorecards = []
    for agent, vals in sorted(per_agent.items()):
        done = vals["completed"]
        fail = vals["failed"]
        score = round((done / max(done + fail, 1)) * 100, 2)
        scorecards.append(
            {
                "agent": agent,
                "reliability": score,
                "completed": done,
                "failed": fail,
                "avg_review_turnaround": round(mean(vals["review_turnaround"]), 2),
            }
        )

    kpis = {
        "latest_week": latest_week,
        "tasks_completed": total_completed,
        "tasks_failed": total_failed,
        "incidents": total_incidents,
        "avg_review_turnaround": avg_review,
        "reliability": reliability,
    }

    return {"kpis": kpis, "trend": trend, "recurrence": recurrence, "turnaround": turnaround, "scorecards": scorecards}


@app.route("/")
def dashboard():
    model = aggregate(load_events())
    return render_template("index.html", model=model, generated_at=datetime.utcnow().isoformat())


@app.route("/api/summary")
def api_summary():
    return jsonify(aggregate(load_events()))


if __name__ == "__main__":
    app.run(debug=True)
