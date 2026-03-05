#!/usr/bin/env python3
from datetime import date, timedelta

from app import create_app
from app.models import Activity, Comment, Notification, Task, User, Workspace, WorkspaceMember, db


def run_seed():
    app = create_app()
    with app.app_context():
        db.drop_all()
        db.create_all()

        admin = User(email="admin@example.com", display_name="Alex Admin", avatar_color="#3b82f6")
        admin.set_password("password123")
        member = User(email="member@example.com", display_name="Maya Member", avatar_color="#22c55e")
        member.set_password("password123")
        db.session.add_all([admin, member])
        db.session.flush()

        workspace = Workspace(name="Launch Control", owner_id=admin.id, invite_slug="launch-control")
        db.session.add(workspace)
        db.session.flush()

        db.session.add_all(
            [
                WorkspaceMember(workspace_id=workspace.id, user_id=admin.id, role="admin"),
                WorkspaceMember(workspace_id=workspace.id, user_id=member.id, role="member"),
            ]
        )

        tasks = [
            Task(
                workspace_id=workspace.id,
                title="Draft launch checklist",
                description="List dependencies and owners.",
                status="todo",
                priority="high",
                due_date=date.today() + timedelta(days=2),
                assignee_id=admin.id,
                created_by=admin.id,
            ),
            Task(
                workspace_id=workspace.id,
                title="QA smoke run",
                description="Run smoke tests on staging.",
                status="in_progress",
                priority="medium",
                due_date=date.today() + timedelta(days=4),
                assignee_id=member.id,
                created_by=admin.id,
            ),
            Task(
                workspace_id=workspace.id,
                title="Stakeholder sign-off",
                description="Collect approvals.",
                status="review",
                priority="urgent",
                due_date=date.today() - timedelta(days=1),
                assignee_id=member.id,
                created_by=admin.id,
            ),
            Task(
                workspace_id=workspace.id,
                title="Retrospective notes",
                description="Capture what worked and what did not.",
                status="done",
                priority="low",
                assignee_id=admin.id,
                created_by=member.id,
            ),
        ]
        db.session.add_all(tasks)
        db.session.flush()

        db.session.add(
            Comment(task_id=tasks[1].id, user_id=admin.id, body="Please include edge cases.", parent_id=None)
        )

        db.session.add_all(
            [
                Activity(
                    workspace_id=workspace.id,
                    task_id=tasks[0].id,
                    actor_id=admin.id,
                    event_type="create",
                    field_name="title",
                    old_value="",
                    new_value=tasks[0].title,
                ),
                Activity(
                    workspace_id=workspace.id,
                    task_id=tasks[1].id,
                    actor_id=admin.id,
                    event_type="status",
                    field_name="status",
                    old_value="todo",
                    new_value="in_progress",
                ),
            ]
        )

        db.session.add(
            Notification(
                recipient_id=member.id,
                actor_id=admin.id,
                workspace_id=workspace.id,
                task_id=tasks[1].id,
                body="You were assigned task 'QA smoke run'.",
                is_read=False,
            )
        )

        db.session.commit()
        print("Seed complete.")
        print("Admin login: admin@example.com / password123")


if __name__ == "__main__":
    run_seed()
