import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow } from "date-fns";
import type { TaskPriority, TaskStatus, AgentStatus } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(timestamp: number): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return "just now";
  }
}

export function getOpenClawAgentId(sessionKey?: string): string | null {
  if (!sessionKey) return null;
  const match = sessionKey.match(/^agent:([^:]+):/i);
  return match?.[1] ?? null;
}

export function getPriorityStyles(priority: TaskPriority): {
  bg: string;
  text: string;
  label: string;
  dot: string;
} {
  switch (priority) {
    case "urgent":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        label: "URGENT",
        dot: "bg-red-500",
      };
    case "high":
      return {
        bg: "bg-orange-50",
        text: "text-orange-700",
        label: "HIGH",
        dot: "bg-orange-500",
      };
    case "normal":
      return {
        bg: "bg-green-50",
        text: "text-green-700",
        label: "NORMAL",
        dot: "bg-green-500",
      };
    case "low":
      return {
        bg: "bg-gray-50",
        text: "text-gray-600",
        label: "LOW",
        dot: "bg-gray-400",
      };
  }
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case "inbox":
      return "text-gray-600";
    case "assigned":
      return "text-orange-600";
    case "in_progress":
      return "text-green-600";
    case "review":
      return "text-amber-600";
    case "waiting":
      return "text-yellow-600";
    case "blocked":
      return "text-red-600";
    case "done":
      return "text-gray-400";
  }
}

export function getStatusColumnStyle(status: TaskStatus): {
  headerBg: string;
  headerText: string;
  dot: string;
} {
  switch (status) {
    case "inbox":
      return { headerBg: "", headerText: "text-gray-700", dot: "bg-gray-400" };
    case "assigned":
      return {
        headerBg: "",
        headerText: "text-orange-700",
        dot: "bg-orange-500",
      };
    case "in_progress":
      return {
        headerBg: "",
        headerText: "text-green-700",
        dot: "bg-green-500",
      };
    case "review":
      return {
        headerBg: "",
        headerText: "text-amber-700",
        dot: "bg-amber-500",
      };
    case "waiting":
      return {
        headerBg: "",
        headerText: "text-yellow-700",
        dot: "bg-yellow-500",
      };
    case "blocked":
      return { headerBg: "", headerText: "text-red-700", dot: "bg-red-500" };
    case "done":
      return { headerBg: "", headerText: "text-gray-500", dot: "bg-gray-400" };
  }
}

export function getAgentStatusStyle(status: AgentStatus): {
  dot: string;
  label: string;
  badge: string;
} {
  switch (status) {
    case "active":
      return {
        dot: "bg-green-500",
        label: "WORKING",
        badge: "bg-green-100 text-green-700",
      };
    case "idle":
      return {
        dot: "bg-gray-400",
        label: "IDLE",
        badge: "bg-gray-100 text-gray-600",
      };
    case "blocked":
      return {
        dot: "bg-red-500",
        label: "BLOCKED",
        badge: "bg-red-100 text-red-700",
      };
    case "paused":
      return {
        dot: "bg-yellow-500",
        label: "PAUSED",
        badge: "bg-yellow-100 text-yellow-700",
      };
  }
}

export function getActivityIcon(type: string): string {
  switch (type) {
    case "task_created":
      return "+";
    case "task_assigned":
      return "→";
    case "task_status_changed":
      return "↻";
    case "message_sent":
      return "💬";
    case "document_created":
      return "📄";
    case "agent_started":
      return "▶";
    case "agent_paused":
      return "⏸";
    case "heartbeat":
      return "♥";
    case "task_triaged":
      return "⊕";
    case "task_review_requested":
      return "🔍";
    case "task_review_passed":
      return "✅";
    case "task_review_failed":
      return "❌";
    case "chief_followup_sent":
      return "📣";
    case "telegram_intake_received":
      return "✈";
    case "telegram_status_sent":
      return "↗";
    case "automation_error":
      return "⚠";
    default:
      return "•";
  }
}

export function getReviewStatusLabel(status?: string): string {
  switch (status) {
    case "pending":
      return "Pending Review";
    case "in_review":
      return "In Review";
    case "changes_requested":
      return "Changes Requested";
    case "approved":
      return "Approved";
    case "not_required":
      return "No Review";
    default:
      return "Unspecified";
  }
}

export function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "inbox":
      return "Inbox";
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "Active";
    case "review":
      return "Review";
    case "waiting":
      return "Waiting";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
  }
}
