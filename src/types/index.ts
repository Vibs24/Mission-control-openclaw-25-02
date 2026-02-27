import type { Id } from "../../convex/_generated/dataModel";

export type AgentStatus = "active" | "idle" | "blocked" | "paused";
export type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "waiting"
  | "blocked"
  | "done";
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type DocumentType =
  | "deliverable"
  | "research"
  | "runbook"
  | "protocol"
  | "standalone";
export type ActivityType =
  | "task_created"
  | "task_assigned"
  | "task_status_changed"
  | "message_sent"
  | "document_created"
  | "agent_started"
  | "agent_paused"
  | "heartbeat"
  | "task_triaged"
  | "task_review_requested"
  | "task_review_passed"
  | "task_review_failed"
  | "chief_followup_sent"
  | "telegram_intake_received"
  | "telegram_status_sent"
  | "automation_error";

export type TaskSource = "manual" | "telegram";
export type TaskReviewStatus =
  | "not_required"
  | "pending"
  | "in_review"
  | "changes_requested"
  | "approved";
export type TaskAutomationState =
  | "new"
  | "triage_pending"
  | "assigned"
  | "executing"
  | "review_pending"
  | "completed"
  | "errored";

export type TaskAgentStepRole = "chief" | "specialist" | "reviewer";
export type TaskAgentStepStatus =
  | "queued"
  | "running"
  | "waiting_handoff"
  | "handed_off"
  | "blocked"
  | "skipped"
  | "failed"
  | "completed";
export type TaskAgentRequiredProof =
  | "comment_summary"
  | "output_path"
  | "document"
  | "none";

export interface Agent {
  _id: Id<"agents">;
  _creationTime: number;
  name: string;
  role: string;
  emoji: string;
  sessionKey: string;
  bio: string;
  skills: string[];
  status: AgentStatus;
  currentTaskId?: Id<"tasks">;
  lastHeartbeat?: number;
}

export interface Task {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assigneeIds: Id<"agents">[];
  creatorId?: Id<"agents">;
  commentCount?: number;
  attachmentCount?: number;
  source?: TaskSource;
  sourceRef?: {
    chatId: string;
    messageId: number;
    updateId: number;
    username?: string;
    displayName?: string;
  };
  requesterName?: string;
  requesterTelegramUserId?: string;
  intakeText?: string;
  chiefAgentId?: Id<"agents">;
  reviewerAgentId?: Id<"agents">;
  reviewRequired?: boolean;
  reviewStatus?: TaskReviewStatus;
  acceptanceCriteria?: string[];
  nextAction?: string;
  nextCheckAt?: number;
  lastChiefCheckAt?: number;
  lastAssigneeUpdateAt?: number;
  staleAfterMinutes?: number;
  escalationLevel?: number;
  automationState?: TaskAutomationState;
}

export interface Message {
  _id: Id<"messages">;
  _creationTime: number;
  taskId: Id<"tasks">;
  fromAgentId?: Id<"agents">;
  fromName?: string;
  content: string;
  attachments?: Id<"documents">[];
  mentionedAgentIds?: Id<"agents">[];
  isSystemMessage?: boolean;
}

export interface Activity {
  _id: Id<"activities">;
  _creationTime: number;
  type: ActivityType;
  agentId?: Id<"agents">;
  agentName?: string;
  taskId?: Id<"tasks">;
  taskTitle?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Document {
  _id: Id<"documents">;
  _creationTime: number;
  title: string;
  content: string;
  type: DocumentType;
  taskId?: Id<"tasks">;
  isPinned?: boolean;
  createdBy?: Id<"agents">;
  createdByName?: string;
}

export interface Notification {
  _id: Id<"notifications">;
  _creationTime: number;
  mentionedAgentId: Id<"agents">;
  content: string;
  taskId?: Id<"tasks">;
  taskTitle?: string;
  fromAgentId?: Id<"agents">;
  fromAgentName?: string;
  delivered: boolean;
}

export interface ChatMessage {
  _id: Id<"chatMessages">;
  _creationTime: number;
  fromAgentId?: Id<"agents">;
  fromName: string;
  fromEmoji: string;
  content: string;
  channel?: string;
}

export interface TaskReview {
  _id: Id<"taskReviews">;
  _creationTime: number;
  taskId: Id<"tasks">;
  reviewerAgentId: Id<"agents">;
  status: "pass" | "fail";
  summary: string;
  findings: string[];
  evidenceRefs?: string[];
  reviewedAt: number;
}

export interface TaskAgentStep {
  _id: Id<"taskAgentSteps">;
  _creationTime: number;
  taskId: Id<"tasks">;
  stepIndex: number;
  agentId: Id<"agents">;
  agentName: string;
  role: TaskAgentStepRole;
  status: TaskAgentStepStatus;
  requiredProof: TaskAgentRequiredProof;
  startedAt?: number;
  lastProgressAt?: number;
  completedAt?: number;
  proofSummary?: string;
  proofPaths?: string[];
  proofMessageId?: Id<"messages">;
  proofDocumentIds?: Id<"documents">[];
  dispatchRunIds?: Id<"automationRuns">[];
  handoffToAgentId?: Id<"agents">;
  handoffAt?: number;
  handoffBy?: string;
  handoffValid?: boolean;
  stuckReason?: string;
  escalationCount?: number;
}

export interface AgentWorkloadSnapshot {
  agentId: Id<"agents">;
  runningCount: number;
  queuedCount: number;
  stuckCount24h: number;
  currentTaskId?: Id<"tasks">;
  lastProofAt?: number;
}

export interface TaskHealth {
  task?: Task;
  steps: TaskAgentStep[];
  runningStep?: TaskAgentStep;
  blockedStep?: TaskAgentStep;
  specialistProofCount: number;
  chiefOnlyRisk: boolean;
  stale: boolean;
  staleForMs: number;
  handoffValidCount: number;
  handoffInvalidCount: number;
  lastProofAt?: number;
}

export type RightPanel =
  | { type: "taskDetail"; taskId: Id<"tasks"> }
  | { type: "agentProfile"; agentId: Id<"agents"> }
  | { type: "docs" }
  | { type: "memory" }
  | { type: "help" }
  | { type: "chat" }
  | null;
