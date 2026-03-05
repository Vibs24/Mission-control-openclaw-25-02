#!/usr/bin/env python3
import argparse
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

from app import create_app, get_db, init_db


USERS = [
    ("admin", "admin123", "Admin", "Alex Admin"),
    ("manager", "manager123", "Manager", "Mira Manager"),
    ("reviewer", "reviewer123", "Reviewer", "Riley Reviewer"),
]

EMPLOYEES = [
    ("EMP001", "Ava Thompson", "ava.thompson@example.com", "Engineering", "Backend Engineer", "Active", 45.0, "2023-02-10"),
    ("EMP002", "Noah Kim", "noah.kim@example.com", "Engineering", "DevOps Engineer", "Active", 48.0, "2022-11-15"),
    ("EMP003", "Sophia Patel", "sophia.patel@example.com", "Finance", "Payroll Specialist", "Active", 42.0, "2021-08-01"),
    ("EMP004", "Liam Garcia", "liam.garcia@example.com", "Operations", "Shift Supervisor", "Active", 38.5, "2020-03-22"),
    ("EMP005", "Emma Chen", "emma.chen@example.com", "HR", "HR Partner", "On Leave", 40.0, "2019-07-30"),
    ("EMP006", "Mason Brooks", "mason.brooks@example.com", "Support", "Support Analyst", "Active", 30.0, "2024-04-17"),
]


def seed(reset=False):
    app = create_app()
    with app.app_context():
        db = get_db()
        init_db()

        if reset:
            db.executescript(
                """
                DELETE FROM notifications;
                DELETE FROM audit_logs;
                DELETE FROM attendance;
                DELETE FROM shifts;
                DELETE FROM leave_requests;
                DELETE FROM employees;
                DELETE FROM users;
                """
            )

        for username, password, role, full_name in USERS:
            db.execute(
                """
                INSERT INTO users (username, password_hash, role, full_name, is_active)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT(username) DO UPDATE SET
                    role = excluded.role,
                    full_name = excluded.full_name,
                    is_active = 1
                """,
                (
                    username,
                    generate_password_hash(password, method="pbkdf2:sha256"),
                    role,
                    full_name,
                ),
            )

        for row in EMPLOYEES:
            db.execute(
                """
                INSERT INTO employees
                (employee_code, full_name, email, department, title, status, hourly_rate, hire_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(employee_code) DO UPDATE SET
                    full_name = excluded.full_name,
                    email = excluded.email,
                    department = excluded.department,
                    title = excluded.title,
                    status = excluded.status,
                    hourly_rate = excluded.hourly_rate,
                    hire_date = excluded.hire_date,
                    updated_at = datetime('now')
                """,
                row,
            )

        manager = db.execute("SELECT id FROM users WHERE username = 'manager'").fetchone()
        reviewer = db.execute("SELECT id FROM users WHERE username = 'reviewer'").fetchone()

        employees = db.execute("SELECT id FROM employees ORDER BY id").fetchall()
        today = date.today()

        for idx, emp in enumerate(employees, start=1):
            shift_date = (today + timedelta(days=idx % 5)).isoformat()
            db.execute(
                """
                INSERT INTO shifts
                (employee_id, shift_date, start_time, end_time, location, notes, status, created_by)
                VALUES (?, ?, '09:00', '17:00', ?, 'Auto-seeded shift', 'Planned', ?)
                """,
                (emp["id"], shift_date, f"Building-{(idx % 3) + 1}", manager["id"]),
            )

            for day_offset in range(0, 4):
                d = (today - timedelta(days=day_offset)).isoformat()
                status = "Present" if day_offset != 2 else "Late"
                db.execute(
                    """
                    INSERT INTO attendance
                    (employee_id, attendance_date, check_in, check_out, status, notes, created_by, approved_by)
                    VALUES (?, ?, ?, ?, ?, 'Seeded record', ?, ?)
                    ON CONFLICT(employee_id, attendance_date) DO UPDATE SET
                        check_in = excluded.check_in,
                        check_out = excluded.check_out,
                        status = excluded.status,
                        notes = excluded.notes,
                        created_by = excluded.created_by,
                        approved_by = excluded.approved_by
                    """,
                    (
                        emp["id"],
                        d,
                        f"{d}T09:00:00",
                        f"{d}T17:00:00",
                        status,
                        manager["id"],
                        reviewer["id"],
                    ),
                )

        if employees:
            db.execute(
                """
                INSERT INTO leave_requests
                (employee_id, leave_type, start_date, end_date, reason, status, requested_by, reviewed_by, reviewed_at, review_note)
                VALUES (?, 'Annual', ?, ?, 'Family event', 'Approved', ?, ?, datetime('now'), 'Approved during seed')
                """,
                (
                    employees[0]["id"],
                    (today + timedelta(days=2)).isoformat(),
                    (today + timedelta(days=4)).isoformat(),
                    manager["id"],
                    reviewer["id"],
                ),
            )
            db.execute(
                """
                INSERT INTO leave_requests
                (employee_id, leave_type, start_date, end_date, reason, status, requested_by)
                VALUES (?, 'Sick', ?, ?, 'Medical rest', 'Pending', ?)
                """,
                (
                    employees[1]["id"],
                    (today + timedelta(days=1)).isoformat(),
                    (today + timedelta(days=1)).isoformat(),
                    manager["id"],
                ),
            )

        db.execute(
            """
            INSERT INTO notifications (user_id, message, level)
            VALUES
            (NULL, 'Seed complete: baseline data loaded.', 'success'),
            (NULL, 'Review pending leave requests.', 'warning')
            """
        )

        db.execute(
            """
            INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, details)
            VALUES (?, 'seed-script', 'SEED', 'system', NULL, 'Database seeded with demo users, employees, shifts, attendance, and leave data')
            """,
            (manager["id"],),
        )

        db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Workforce Command Center data")
    parser.add_argument("--reset", action="store_true", help="Clear data tables before seeding")
    args = parser.parse_args()
    seed(reset=args.reset)
    print("Seed complete.")
