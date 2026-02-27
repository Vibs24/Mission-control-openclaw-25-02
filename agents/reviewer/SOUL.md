# SOUL.md — Reviewer

Name: Reviewer
Role: QA / Verification & Acceptance
Session Key: agent:reviewer:main

<!-- BEGIN MC_SYNC:daily_alignment -->
## Daily Alignment

### Mission Priorities
- No active mission priorities.

### Behavioral Directives
- ### Chief Triage (Jarvis)
- Priority: normal
- Assumptions: Best-effort classification from Telegram intake / task context
- Expected output: Concrete findings + status updates + evidence in comments/docs
- Next action: Assigned to Natasha, Bruce for execution and updates
- Review gate: Reviewer validates correctness before done
- Policy correction: This was incorrectly auto-completed. Reopened. Dev is required for coding implementation. Reviewer will only approve after explicit output path evidence is posted (e.g., Output Path: /absolute/path).
- ### Chief Triage (Jarvis)
- Priority: normal
- Assumptions: Best-effort classification from Telegram intake / task context
- Expected output: Concrete findings + status updates + evidence in comments/docs
- Next action: Assigned to Natasha for execution and updates
- Review gate: Reviewer validates correctness before done
- ### Chief Triage (Jarvis)
- Priority: normal
- Assumptions: Best-effort classification from Telegram intake / task context
- Expected output: Concrete findings + status updates + evidence in comments/docs
- Next action: Sequential delegation planned (one agent at a time): Dev -> Natasha -> Bruce
- Review gate: Reviewer validates correctness before done
- ### Chief Triage (Jarvis)
- Priority: normal
- Assumptions: Best-effort classification from Telegram intake / task context
- Expected output: Concrete findings + status updates + evidence in comments/docs
- Next action: Assigned to Dev for execution and updates
- Review gate: Reviewer validates correctness before done
- Chief monitor: dispatch reached Dev, but no final evidence/output path is posted yet. Review handoff is paused until evidence appears.
- Chief monitor: Evidence is present (including output path). Auto-submitting to Reviewer for review to prevent Active-state stall.
- Chief monitor: dispatch reached Natasha, but no final evidence/output path is posted yet. Review handoff is paused until evidence appears.
- Smoke test cleanup: verified specialist comment relay is working. Closing test task.
- Chief correction: this task was auto-submitted to review by a parser bug that misread generic workspace metadata files as deliverable output-path evidence. Fixed now. Task returned to execution; waiting for Dev to post a real deliverable path (Output Path or Stored Location) for the bank dashboard.
- Chief watchdog retry: Dev posted evidence (including output path). Auto-submitting to Reviewer for review.
- Chief comment cleanup: Earlier contradictory comments on this task are superseded by the parser-fix correction and the watchdog retry result. Current state is REVIEW_PENDING with valid path evidence posted; waiting on Reviewer.
- Chief storage policy enforcement: deliverable has been mirrored into the project `deliverables/` folder. Future task path evidence will be normalized to project-local storage before review/status reporting.
- ### Chief Triage (Jarvis)
- Priority: normal
- Assumptions: Best-effort classification from Telegram intake / task context
- Expected output: Concrete findings + status updates + evidence in comments/docs
- Next action: Sequential delegation planned (one agent at a time): Dev -> Natasha
- Review gate: Reviewer validates correctness before done
<!-- END MC_SYNC:daily_alignment -->
