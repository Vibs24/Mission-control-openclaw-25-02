import type { Id } from "../../convex/_generated/dataModel";

export type AgentStatus = "active" | "idle" | "blocked" | "paused";
export type AgentRoleKey =
  | "chief"
  | "project_manager"
  | "frontend"
  | "designer"
  | "database"
  | "backend"
  | "documentation"
  | "operations"
  | "reviewer"
  | "legacy";
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
export type WorkflowKind =
  | "general"
  | "review"
  | "debug"
  | "incident"
  | "architecture"
  | "standup"
  | "deploy_checklist";
export type OrchestrationModel = "legacy_sequential" | "chief_pm_parallel";
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

export type TaskExecutionNodeRole =
  | "chief"
  | "project_manager"
  | "specialist"
  | "reviewer";
export type TaskExecutionNodeStatus =
  | "queued"
  | "dependency_wait"
  | "runnable"
  | "running"
  | "waiting_handoff"
  | "blocked"
  | "failed"
  | "completed"
  | "skipped";

export type ExecutionEventKind =
  | "triage"
  | "dispatch"
  | "worklog"
  | "heartbeat"
  | "handoff"
  | "proof"
  | "review"
  | "recovery"
  | "system";

export type ExecutionEventSeverity = "info" | "success" | "warning" | "error";

export interface Agent {
  _id: Id<"agents">;
  _creationTime: number;
  name: string;
  role: string;
  roleKey?: AgentRoleKey;
  specialty?: string;
  routable?: boolean;
  retired?: boolean;
  displayOrder?: number;
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
  workflowKind?: WorkflowKind;
  workflowCommand?: string;
  workflowVersion?: number;
  orchestrationModel?: OrchestrationModel;
  projectManagerAgentId?: Id<"agents">;
  dependencySpec?: string;
  graphVersion?: number;
  graphReadyAt?: number;
  artifactRootPath?: string;
  artifactPolicy?: "auto_managed" | "manual";
  artifactLastVerifiedAt?: number;
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
  kind?: "note" | "worklog" | "handoff" | "review" | "system";
  stepIndex?: number;
  workflowKind?: WorkflowKind;
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
  _id: string;
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
  lastStructuredWorklogAt?: number;
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

export interface TaskWorkflowHealth {
  taskId: Id<"tasks">;
  workflowKind: WorkflowKind;
  workflowVersion: number;
  currentStepIndex: number | null;
  currentAgentName: string | null;
  currentStatus: TaskAgentStepStatus | null;
  nextRequiredProof: TaskAgentRequiredProof | null;
  missingFields: string[];
  stale: boolean;
  artifactRootPath?: string | null;
  awaitingArtifactsInAutoFolder?: boolean;
}

export interface ExecutionEvent {
  _id: Id<"executionEvents">;
  _creationTime: number;
  taskId?: Id<"tasks">;
  actorAgentId?: Id<"agents">;
  actorName: string;
  actorRole: "chief" | "project_manager" | "specialist" | "reviewer" | "system";
  kind: ExecutionEventKind;
  severity: ExecutionEventSeverity;
  title: string;
  summary: string;
  workDone?: string;
  workingNow?: string;
  nextSteps?: string;
  blockers?: string;
  evidencePaths?: string[];
  detailsMarkdown?: string;
  detailsJson?: Record<string, unknown>;
  relatedMessageId?: Id<"messages">;
  relatedStepId?: Id<"taskAgentSteps">;
  relatedRunId?: Id<"automationRuns">;
  createdAt: number;
}

export interface AgentProofCompliance {
  agentId: Id<"agents">;
  totalProofChecks: number;
  passedProofChecks: number;
  complianceRate: number;
  lastProofAt?: number;
}

export interface TaskExecutionNode {
  _id: string;
  _creationTime: number;
  taskId: Id<"tasks">;
  nodeKey: string;
  agentId: Id<"agents">;
  agentName: string;
  role: TaskExecutionNodeRole;
  status: TaskExecutionNodeStatus;
  dependsOnNodeKeys: string[];
  requiredProof: TaskAgentRequiredProof;
  startedAt?: number;
  lastProgressAt?: number;
  completedAt?: number;
  proofSummary?: string;
  proofPaths?: string[];
  proofMessageId?: Id<"messages">;
  proofDocumentIds?: Id<"documents">[];
  dispatchRunIds?: Id<"automationRuns">[];
  stuckReason?: string;
  retryCount?: number;
  escalationCount?: number;
  workDone?: string;
  workingNow?: string;
  nextSteps?: string;
  blockers?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TaskGraphHealth {
  taskId: Id<"tasks">;
  totalNodes: number;
  counts: Record<TaskExecutionNodeStatus, number>;
  proofReadyCount: number;
  runningNodes: TaskExecutionNode[];
  blockedNodes: TaskExecutionNode[];
  deadlock: boolean;
  healthy: boolean;
  updatedAt: number;
}

export type RightPanel =
  | { type: "taskDetail"; taskId: Id<"tasks"> }
  | { type: "executionEvent"; eventId: Id<"executionEvents"> }
  | { type: "agentProfile"; agentId: Id<"agents"> }
  | { type: "docs" }
  | { type: "memory" }
  | { type: "help" }
  | { type: "chat" }
  | null;
