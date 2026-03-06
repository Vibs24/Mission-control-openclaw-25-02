import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { PriorityBadge } from "../shared/PriorityBadge";
import { AgentAvatar } from "../agents/AgentCard";
import {
  formatRelativeTime,
  getReviewStatusLabel,
  getStatusColor,
  getStatusLabel,
} from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  Activity,
  Agent,
  Document,
  ExecutionEvent,
  Message,
  Task,
  TaskAgentStep,
  TaskExecutionNode,
  TaskGraphHealth,
  TaskHealth,
  TaskReview,
  TaskWorkflowHealth,
} from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TaskDetailPanelProps {
  taskId: Id<"tasks">;
  onClose: () => void;
}

type TimelineTone = "default" | "success" | "warning" | "danger";

type TimelineItem = {
  id: string;
  at: number;
  actorName: string;
  actorEmoji: string;
  source: "comment" | "step" | "run" | "activity" | "event";
  headline: string;
  details: string[];
  tone: TimelineTone;
  badge: "worklog" | "handoff" | "proof_pass" | "proof_fail" | "review_decision" | "note";
};

const DEFAULT_ARTIFACTS_ROOT = "/Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables";

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function slugifyTaskTitle(value: string) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deliverable"
  );
}

function summarizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata || typeof metadata !== "object") return "";
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" • ");
}

function activityHeadline(type: Activity["type"]) {
  switch (type) {
    case "task_created":
      return "Task created";
    case "task_assigned":
      return "Task assigned";
    case "task_status_changed":
      return "Status changed";
    case "message_sent":
      return "Message sent";
    case "document_created":
      return "Document attached";
    case "agent_started":
      return "Agent started";
    case "agent_paused":
      return "Agent paused";
    case "heartbeat":
      return "Heartbeat update";
    case "task_triaged":
      return "Chief triage";
    case "task_review_requested":
      return "Submitted for review";
    case "task_review_passed":
      return "Review approved";
    case "task_review_failed":
      return "Review changes requested";
    case "chief_followup_sent":
      return "Chief follow-up";
    case "telegram_intake_received":
      return "Telegram intake";
    case "telegram_status_sent":
      return "Telegram status sent";
    case "automation_error":
      return "Automation error";
    default:
      return "Activity";
  }
}

function deriveTimelineBadge(entry: Omit<TimelineItem, "badge">): TimelineItem["badge"] {
  const text = entry.details.join(" ").toLowerCase();
  if (entry.source === "event") {
    if (/worklog/i.test(entry.headline)) return "worklog";
    if (/handoff/i.test(entry.headline)) return "handoff";
    if (entry.tone === "success" && /proof|review/i.test(entry.headline)) return "proof_pass";
    if (entry.tone === "danger") return "proof_fail";
    if (/review/i.test(entry.headline)) return "review_decision";
  }
  if (entry.source === "comment" && /worklog/i.test(entry.headline)) return "worklog";
  if (entry.source === "step" && (text.includes("status: handed_off") || text.includes("handoff to:"))) {
    return "handoff";
  }
  if (entry.source === "step" && entry.tone === "success") return "proof_pass";
  if (entry.source === "step" && entry.tone === "danger") return "proof_fail";
  if (entry.source === "comment" && /review/i.test(entry.headline)) return "review_decision";
  if (entry.source === "activity" && /review/i.test(entry.headline.toLowerCase())) return "review_decision";
  return "note";
}

function executionEventDetails(event: ExecutionEvent, expanded: boolean) {
  const details: string[] = [];
  if (event.summary) details.push(event.summary);
  if (event.workDone) details.push(`Work Done: ${event.workDone}`);
  if (event.workingNow) details.push(`Working Now: ${event.workingNow}`);
  if (event.nextSteps) details.push(`Next Steps: ${event.nextSteps}`);
  if (event.blockers) details.push(`Blockers: ${event.blockers}`);
  if ((event.evidencePaths?.length ?? 0) > 0) {
    details.push(...(event.evidencePaths ?? []).map((path) => `Evidence: ${path}`));
  }
  if (event.detailsMarkdown) {
    const lines = toLines(event.detailsMarkdown);
    if (expanded) {
      details.push(...lines);
    } else if (lines.length > 0) {
      details.push(...lines.slice(0, 6));
      if (lines.length > 6) details.push("…");
    }
  }
  return details;
}

function hasStepProofSummary(step: TaskAgentStep | null) {
  if (!step) return false;
  return (
    Boolean(step.proofSummary) ||
    Boolean(step.proofMessageId) ||
    (step.proofDocumentIds?.length ?? 0) > 0
  );
}

function renderProofRequirementLabel(
  requiredProof: string | null | undefined,
  autoManagedArtifacts: boolean
) {
  const value = String(requiredProof || "none");
  if (value === "output_path") {
    return autoManagedArtifacts
      ? "artifact_folder_deliverables (auto-managed)"
      : "output_path";
  }
  if (value === "comment_summary") return "structured_worklog_summary";
  return value;
}

function deriveWorkflowView(task: Task, steps: TaskAgentStep[], server: TaskWorkflowHealth | null) {
  const sorted = [...(steps || [])].sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
  const current =
    sorted.find((step) => step.status === "running") ||
    sorted.find((step) => step.status === "blocked" || step.status === "failed") ||
    sorted.find((step) => step.status === "waiting_handoff") ||
    sorted.find((step) => step.status === "queued") ||
    sorted[0] ||
    null;

  const derivedArtifactRootPath =
    task?._id && task?.title
      ? `${DEFAULT_ARTIFACTS_ROOT}/${task._id}-${slugifyTaskTitle(task.title)}`
      : null;
  const autoManagedArtifacts = String(task?.artifactPolicy || "").toLowerCase() !== "manual";
  const currentRequiredProof = String(current?.requiredProof || "");
  const currentStatus = String(current?.status || "");
  const stuckReason = String(current?.stuckReason || "").toLowerCase();
  const hasPathProof = (current?.proofPaths?.length ?? 0) > 0;
  const reasonIndicatesInvalidPathEvidence =
    stuckReason.startsWith("artifact_path_not_found") ||
    stuckReason.startsWith("artifact_folder_empty") ||
    stuckReason.startsWith("missing_output_path") ||
    stuckReason.startsWith("output_path_not_found") ||
    stuckReason.startsWith("output_path_empty") ||
    stuckReason.startsWith("no_verifiable_file_evidence") ||
    (stuckReason.startsWith("no_assignee_progress") &&
      /(output_path|path|artifact|evidence)/i.test(stuckReason));
  const missingFields: string[] = [];
  const awaitingArtifactsInAutoFolder =
    autoManagedArtifacts &&
    currentStatus === "running" &&
    currentRequiredProof === "output_path" &&
    !hasPathProof;

  if (currentRequiredProof === "comment_summary" && !hasStepProofSummary(current)) {
    missingFields.push("Structured summary");
  }

  if (currentRequiredProof === "output_path" && (!hasPathProof || reasonIndicatesInvalidPathEvidence)) {
    if (autoManagedArtifacts) {
      if (currentStatus === "running" || stuckReason.startsWith("agent_unavailable")) {
        // Expected to be pending while specialist is still executing or waiting on agent slot.
      } else if (stuckReason.startsWith("invalid_worklog_schema")) {
        missingFields.push("Structured summary");
      } else if (stuckReason.startsWith("artifact_path_not_found")) {
        missingFields.push("Artifact folder path is missing on disk");
      } else if (
        stuckReason.startsWith("artifact_folder_empty") ||
        stuckReason.startsWith("missing_output_path") ||
        stuckReason.startsWith("output_path_not_found") ||
        stuckReason.startsWith("output_path_empty") ||
        stuckReason.startsWith("no_verifiable_file_evidence")
      ) {
        missingFields.push("Artifact folder has no verifiable deliverable files");
      } else {
        missingFields.push("Artifact folder deliverables");
      }
    } else if (currentStatus !== "running" && !stuckReason.startsWith("agent_unavailable")) {
      missingFields.push("Output Path or Stored Location");
    }
  }

  if (currentRequiredProof === "document" && (current?.proofDocumentIds?.length ?? 0) === 0) {
    missingFields.push("Attached document evidence");
  }

  return {
    workflowKind: (server?.workflowKind ?? task.workflowKind ?? "general") as string,
    workflowVersion: Number(server?.workflowVersion ?? task.workflowVersion ?? 1),
    currentStepIndex:
      current !== null
        ? Number(current.stepIndex)
        : server?.currentStepIndex !== null && server?.currentStepIndex !== undefined
          ? Number(server.currentStepIndex)
          : null,
    currentStatus: current?.status ?? server?.currentStatus ?? null,
    currentAgentName: current?.agentName ?? server?.currentAgentName ?? null,
    nextRequiredProof: current?.requiredProof ?? server?.nextRequiredProof ?? null,
    artifactRootPath: task.artifactRootPath ?? derivedArtifactRootPath ?? server?.artifactRootPath ?? null,
    autoManagedArtifacts,
    awaitingArtifactsInAutoFolder,
    missingFields,
    currentStep: current,
  };
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const [newComment, setNewComment] = useState("");
  const [showContent, setShowContent] = useState(false);
  const [actorFilter, setActorFilter] = useState<string>("All");
  const [executionLimit, setExecutionLimit] = useState(120);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const task = useQuery(api.tasks.get, { id: taskId });
  const executionLogs =
    (useQuery((api as any).messages.listExecutionLogsByTask, { taskId, limit: 220 }) ?? []) as any[];
  const messages = executionLogs as Message[];
  const agents = (useQuery(api.agents.list, { includeRetired: true }) ?? []) as Agent[];
  const documents = (useQuery(api.documents.list, { taskId }) ?? []) as Document[];
  const reviews = (useQuery((api as any).reviews.listByTask, { taskId }) ?? []) as TaskReview[];
  const automationRuns =
    (useQuery((api as any).automation.listAutomationRunsByTask, { taskId }) ?? []) as any[];
  const taskActivities =
    (useQuery((api as any).activities.listByTask, { taskId, limit: 160 }) ?? []) as Activity[];
  const accountabilitySteps =
    (useQuery((api as any).accountability.listByTask, { taskId }) ?? []) as TaskAgentStep[];
  const taskHealth =
    (useQuery((api as any).accountability.taskHealth, { taskId }) ?? null) as TaskHealth | null;
  const workflowHealthQuery =
    (useQuery((api as any).accountability.workflowHealthByTask, { taskId }) ?? null) as TaskWorkflowHealth | null;
  const executionEventsPage =
    (useQuery((api as any).executionEvents.listByTask, {
      taskId,
      limit: executionLimit,
    }) ?? null) as { events: ExecutionEvent[]; hasMore: boolean; nextCursor?: number } | null;
  const executionGraphNodes =
    (useQuery((api as any).executionGraph.listByTask, { taskId }) ?? []) as TaskExecutionNode[];
  const executionGraphHealth =
    (useQuery((api as any).executionGraph.taskGraphHealth, { taskId }) ?? null) as TaskGraphHealth | null;
  const createMessage = useMutation(api.messages.create);
  const archiveTask = useMutation(api.tasks.archive);

  if (!task) return null;

  const workflowView = deriveWorkflowView(task, accountabilitySteps, workflowHealthQuery);
  const executionEvents = (executionEventsPage?.events ?? []) as ExecutionEvent[];
  const useExecutionEvents = executionEvents.length > 0;
  const executionEventById = new Map(
    executionEvents.map((event) => [String(event._id), event])
  );

  const assignees = task.assigneeIds
    .map((id: Id<"agents">) => agents.find((a: Agent) => a._id === id))
    .filter(Boolean);
  const currentWorkflowStep = workflowView.currentStep;
  const isBusyAvailabilityIssue = String(currentWorkflowStep?.stuckReason || "")
    .toLowerCase()
    .startsWith("agent_unavailable");
  const runningOutputProofStep =
    String(workflowView.currentStatus ?? currentWorkflowStep?.status ?? "") === "running" &&
    String(workflowView.nextRequiredProof ?? currentWorkflowStep?.requiredProof ?? "") === "output_path";
  const awaitingArtifactsInAutoFolder = Boolean(workflowView.awaitingArtifactsInAutoFolder) || runningOutputProofStep;
  const visibleArtifactRootPath = workflowView.artifactRootPath ?? "n/a";
  const autoManagedArtifacts = workflowView.autoManagedArtifacts;
  const visibleMissingFields = (workflowView.missingFields ?? []).filter((field) => {
    if (awaitingArtifactsInAutoFolder && /output path|stored location/i.test(String(field || ""))) {
      return false;
    }
    if (!isBusyAvailabilityIssue) return true;
    return !/output path|stored location/i.test(String(field || ""));
  });

  const handleComment = async () => {
    if (!newComment.trim()) return;
    await createMessage({
      taskId,
      fromName: "Sypha",
      content: newComment,
      kind: "note",
      workflowKind: task.workflowKind ?? "general",
    });
    setNewComment("");
  };

  const agentsById = new Map(agents.map((agent: Agent) => [String(agent._id), agent]));
  const agentsByName = new Map(
    agents.map((agent: Agent) => [String(agent.name || "").toLowerCase(), agent])
  );
  const resolveAgent = (agentId?: Id<"agents"> | null, actorName?: string | null) => {
    if (agentId) {
      const byId = agentsById.get(String(agentId));
      if (byId) return byId;
    }
    const normalizedName = String(actorName || "").toLowerCase().trim();
    if (!normalizedName) return undefined;
    return agentsByName.get(normalizedName);
  };
  const fallbackEmojiByRole = (role: string) => {
    if (role === "chief") return "👑";
    if (role === "project_manager") return "📋";
    if (role === "reviewer") return "✅";
    if (role === "specialist") return "💻";
    return "📌";
  };
  const runsById = new Map(automationRuns.map((run: any) => [String(run._id), run]));
  const timeline: Array<Omit<TimelineItem, "badge">> = [];

  for (const msg of messages) {
    const agent = resolveAgent(msg.fromAgentId, msg.fromName);
    const actorName = msg.fromName ?? agent?.name ?? "Unknown";
    const kind = (msg as any).effectiveKind ?? msg.kind ?? "note";
    timeline.push({
      id: `msg-${msg._id}`,
      at: msg._creationTime,
      actorName,
      actorEmoji: agent?.emoji ?? "👤",
      source: "comment",
      headline:
        kind === "worklog"
          ? "Structured worklog update"
          : kind === "handoff"
            ? "Handoff update"
            : kind === "review"
              ? "Review decision/update"
              : "Comment update",
      details: toLines(msg.content),
      tone: kind === "review" ? "success" : "default",
    });
  }

  for (const step of accountabilitySteps) {
    const agent = agentsById.get(String(step.agentId));
    const details = [
      `Step #${step.stepIndex} (${step.role})`,
      `Status: ${step.status}`,
      `Required proof: ${renderProofRequirementLabel(step.requiredProof, autoManagedArtifacts)}`,
    ];
    if (step.proofSummary) details.push(`Proof summary: ${step.proofSummary}`);
    if ((step.proofPaths?.length ?? 0) > 0) {
      details.push(...(step.proofPaths ?? []).map((path) => `Path: ${path}`));
    }
    if (step.stuckReason) details.push(`Reason: ${step.stuckReason}`);
    if (step.handoffToAgentId) {
      const nextAgent = agentsById.get(String(step.handoffToAgentId));
      details.push(`Handoff to: ${nextAgent?.name ?? "next assignee"}`);
    }

    timeline.push({
      id: `step-${step._id}-${step.status}`,
      at: step.lastProgressAt ?? step.completedAt ?? step.startedAt ?? step._creationTime,
      actorName: step.agentName ?? agent?.name ?? "Agent",
      actorEmoji: agent?.emoji ?? "🧩",
      source: "step",
      headline: "Accountability step update",
      details,
      tone:
        step.status === "completed" || step.status === "handed_off"
          ? "success"
          : step.status === "blocked" || step.status === "failed"
            ? "danger"
            : step.status === "running"
              ? "warning"
              : "default",
    });

    for (const runId of step.dispatchRunIds ?? []) {
      const run = runsById.get(String(runId));
      if (!run) continue;
      const runDetails = [
        `Dispatch: ${run.dispatchType}`,
        `Role: ${run.role}`,
        `Attempt: ${run.attempt}`,
      ];
      if (run.outputSummary) runDetails.push(`Summary: ${run.outputSummary}`);
      if (run.error) runDetails.push(`Error: ${run.error}`);
      timeline.push({
        id: `run-${step._id}-${run._id}`,
        at: run.finishedAt ?? run.startedAt ?? step.lastProgressAt ?? step._creationTime,
        actorName: run.agentName ?? step.agentName,
        actorEmoji: agent?.emoji ?? "⚙️",
        source: "run",
        headline: `Automation ${run.status}`,
        details: runDetails,
        tone:
          run.status === "succeeded"
            ? "success"
            : run.status === "failed"
              ? "danger"
              : "warning",
      });
    }
  }

  for (const activity of taskActivities) {
    if (activity.type === "message_sent") continue;
    const agent = resolveAgent(activity.agentId, activity.agentName);
    const details = [activity.message];
    const metadataSummary = summarizeMetadata(activity.metadata as Record<string, unknown>);
    if (metadataSummary) details.push(metadataSummary);
    timeline.push({
      id: `activity-${activity._id}`,
      at: activity._creationTime,
      actorName: activity.agentName ?? agent?.name ?? "System",
      actorEmoji: agent?.emoji ?? "📌",
      source: "activity",
      headline: activityHeadline(activity.type),
      details,
      tone: activity.type === "automation_error" ? "danger" : "default",
    });
  }

  const timelineItems = timeline
    .map((entry) => ({ ...entry, badge: deriveTimelineBadge(entry) }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 180);
  const executionTimelineItems: TimelineItem[] = executionEvents
    .map((event) => {
      const agent = resolveAgent(event.actorAgentId, event.actorName);
      const roleEmoji = agent?.emoji ?? fallbackEmojiByRole(event.actorRole);
      const at = Number(event.createdAt || event._creationTime || Date.now());
      const tone: TimelineTone =
        event.severity === "success"
          ? "success"
          : event.severity === "warning"
            ? "warning"
            : event.severity === "error"
              ? "danger"
              : "default";
      const details = executionEventDetails(event, Boolean(expandedEvents[String(event._id)]));
      const entry: Omit<TimelineItem, "badge"> = {
        id: `event-${String(event._id)}`,
        at,
        actorName: event.actorName,
        actorEmoji: roleEmoji,
        source: "event",
        headline: event.title,
        details,
        tone,
      };
      return { ...entry, badge: deriveTimelineBadge(entry) } as TimelineItem;
    })
    .sort((a, b) => b.at - a.at);

  const sourceTimeline = useExecutionEvents ? executionTimelineItems : timelineItems;
  const actorOptions = [
    "All",
    ...Array.from(new Set(sourceTimeline.map((item) => item.actorName).filter(Boolean))).slice(0, 24),
  ];
  const visibleTimelineItems =
    actorFilter === "All"
      ? sourceTimeline
      : sourceTimeline.filter((item) => item.actorName === actorFilter);
  const graphNodesSorted = [...(executionGraphNodes ?? [])].sort((a, b) => {
    const aAt = Number(a.createdAt ?? a._creationTime ?? 0);
    const bAt = Number(b.createdAt ?? b._creationTime ?? 0);
    if (aAt !== bAt) return aAt - bAt;
    return String(a.nodeKey || "").localeCompare(String(b.nodeKey || ""));
  });

  return (
    <Panel title="Task Detail" onClose={onClose} width="w-[480px]">
      <div className="p-4">
        {/* Creator */}
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-3">
          <span>A</span>
          <span>by {assignees[0]?.name ?? "Jarvis"}</span>
        </div>

        {/* View Content toggle */}
        <button
          className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 mb-4"
          onClick={() => setShowContent(!showContent)}
        >
          <span>{showContent ? "▲" : "▼"}</span>
          <span>View content</span>
        </button>

        {showContent && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            {/* Task title as doc title */}
            <h2 className="text-base font-bold text-gray-900 mb-4">{task.title}</h2>

            {/* Description rendered as markdown */}
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.description}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <PriorityBadge priority={task.priority} />
          <span
            className={`text-xs font-medium ${getStatusColor(task.status)}`}
          >
            {getStatusLabel(task.status)}
          </span>
          {task.labels.map((label: string) => (
            <span
              key={label}
              className="text-[9px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-medium"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Intake / automation metadata */}
        <div className="mb-4 p-3 bg-white border border-gray-100 rounded-lg space-y-2">
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-600">
            <span className="font-semibold uppercase tracking-wider text-gray-500">
              Source
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-100">
              {task.source ?? "manual"}
            </span>
            {task.source === "telegram" && task.requesterName && (
              <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700">
                Requester: {task.requesterName}
              </span>
            )}
            {task.reviewStatus && (
              <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700">
                {getReviewStatusLabel(task.reviewStatus)}
              </span>
            )}
            {task.automationState && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                {task.automationState.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {task.nextAction && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Next Action
              </p>
              <p className="text-xs text-gray-700">{task.nextAction}</p>
            </div>
          )}

          {(task.nextCheckAt || task.lastChiefCheckAt || task.lastAssigneeUpdateAt) && (
            <div className="grid grid-cols-1 gap-1 text-[10px] text-gray-500">
              {task.nextCheckAt && (
                <div>Next chief check: {formatRelativeTime(task.nextCheckAt)}</div>
              )}
              {task.lastChiefCheckAt && (
                <div>Last chief check: {formatRelativeTime(task.lastChiefCheckAt)}</div>
              )}
              {task.lastAssigneeUpdateAt && (
                <div>
                  Last assignee update: {formatRelativeTime(task.lastAssigneeUpdateAt)}
                </div>
              )}
            </div>
          )}

          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Acceptance Criteria
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {task.acceptanceCriteria.map((criterion: string, idx: number) => (
                  <li key={`${criterion}-${idx}`} className="text-xs text-gray-700">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Workflow */}
        <div className="mb-4 p-3 bg-white border border-gray-100 rounded-lg space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            Workflow
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
            <div>Kind: {workflowView.workflowKind}</div>
            <div>Version: {workflowView.workflowVersion}</div>
            <div>
              Model: {task.orchestrationModel ?? "legacy_sequential"}
            </div>
            <div>
              PM: {task.projectManagerAgentId ? (agentsById.get(String(task.projectManagerAgentId))?.name ?? "assigned") : "n/a"}
            </div>
            <div>
              Current step:{" "}
              {workflowView.currentStepIndex !== null && workflowView.currentStepIndex !== undefined
                ? `#${workflowView.currentStepIndex}`
                : "n/a"}
            </div>
            <div>Status: {workflowView.currentStatus ?? "n/a"}</div>
            <div className="col-span-2">
              Assignee: {workflowView.currentAgentName ?? "n/a"}
            </div>
            <div className="col-span-2">
              Next required proof:{" "}
              {renderProofRequirementLabel(
                workflowView.nextRequiredProof ?? "none",
                autoManagedArtifacts
              )}
            </div>
            <div className="col-span-2">
              Artifact Folder: {visibleArtifactRootPath}
            </div>
          </div>
          {awaitingArtifactsInAutoFolder && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
              Awaiting artifacts in auto-managed folder.
            </div>
          )}
          {visibleMissingFields.length > 0 && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1.5">
              Missing fields: {visibleMissingFields.join(", ")}
            </div>
          )}
          {currentWorkflowStep?.stuckReason && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1.5">
              Proof issue: {currentWorkflowStep.stuckReason}
            </div>
          )}
        </div>

        {graphNodesSorted.length > 0 && (
          <div className="mb-4 p-3 bg-white border border-gray-100 rounded-lg space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
              Execution Graph
            </p>
            {executionGraphHealth && (
              <div className="text-[10px] text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                <span className="mr-3">running: {executionGraphHealth.counts.running ?? 0}</span>
                <span className="mr-3">runnable: {executionGraphHealth.counts.runnable ?? 0}</span>
                <span className="mr-3">dependency_wait: {executionGraphHealth.counts.dependency_wait ?? 0}</span>
                <span className="mr-3">blocked: {(executionGraphHealth.counts.blocked ?? 0) + (executionGraphHealth.counts.failed ?? 0)}</span>
                <span className="mr-3">completed: {(executionGraphHealth.counts.completed ?? 0) + (executionGraphHealth.counts.skipped ?? 0)}</span>
                <span className={executionGraphHealth.deadlock ? "text-rose-600 font-semibold" : "text-emerald-700"}>
                  {executionGraphHealth.deadlock ? "deadlock detected" : "healthy"}
                </span>
              </div>
            )}
            <div className="space-y-2">
              {graphNodesSorted.map((node) => (
                <div key={node._id} className="border border-gray-100 rounded p-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-800">
                      {node.agentName} ({node.role})
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        node.status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : node.status === "running"
                            ? "bg-amber-50 text-amber-700"
                            : node.status === "blocked" || node.status === "failed"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {node.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-600 space-y-0.5">
                    <div>Node: {node.nodeKey}</div>
                    <div>Depends on: {node.dependsOnNodeKeys?.length ? node.dependsOnNodeKeys.join(", ") : "none"}</div>
                    <div>Required proof: {node.requiredProof}</div>
                    {node.lastProgressAt && (
                      <div>Last progress: {formatRelativeTime(node.lastProgressAt)}</div>
                    )}
                    {node.stuckReason && (
                      <div className="text-rose-700">Reason: {node.stuckReason}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assignees */}
        {assignees.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {assignees.map((agent: Agent | undefined) =>
              agent ? (
                <div
                  key={agent._id}
                  className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full"
                >
                  <AgentAvatar emoji={agent.emoji} size="xs" />
                  <span>{agent.name}</span>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              Attached Documents ({documents.length})
            </p>
            <p className="mb-2 text-[10px] text-gray-500">
              Stored in Convex table <code>documents</code> (database-backed) and mirrored into
              the task artifact folder under <code>_mc_documents/</code>.
            </p>
            <div className="space-y-1">
              {documents.map((doc: Document) => (
                <div
                  key={doc._id}
                  className="flex items-center gap-2 text-xs text-blue-600 hover:underline cursor-pointer py-1"
                >
                  <span>📄</span>
                  <span>{doc.title}</span>
                  {doc.type === "runbook" && (
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      runbook
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Archive */}
        {task.status !== "done" && (
          <button
            onClick={() => archiveTask({ id: taskId })}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded mb-5 hover:bg-gray-50"
          >
            🗂️ Archive Task
          </button>
        )}

        {/* Comments */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
            Comments & Execution Log ({visibleTimelineItems.length})
          </p>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {actorOptions.map((actor) => (
              <button
                key={actor}
                onClick={() => setActorFilter(actor)}
                className={`text-[10px] px-2 py-1 rounded border ${
                  actorFilter === actor
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {actor}
              </button>
            ))}
          </div>

          <div className="space-y-3 mb-4">
            {visibleTimelineItems.map((entry: TimelineItem) => {
              const toneClass =
                entry.tone === "success"
                  ? "border-emerald-100 bg-emerald-50/40"
                  : entry.tone === "danger"
                    ? "border-rose-100 bg-rose-50/40"
                    : entry.tone === "warning"
                      ? "border-amber-100 bg-amber-50/40"
                      : "border-gray-100 bg-white";
              return (
                <div key={entry.id} className={`flex gap-2.5 border rounded p-2 ${toneClass}`}>
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">
                    {entry.actorEmoji}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-semibold text-gray-800">
                        {entry.actorName}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                        {entry.badge}
                      </span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                        {entry.source}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatRelativeTime(entry.at)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-700 mb-1">{entry.headline}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {entry.details.map((line, idx) => (
                        <li
                          key={`${entry.id}-${idx}`}
                          className="text-xs text-gray-600 leading-relaxed break-words"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                    {entry.source === "event" && (() => {
                      const eventId = String(entry.id).replace(/^event-/, "");
                      const event = executionEventById.get(eventId);
                      if (!event?.detailsMarkdown) return null;
                      const isExpanded = Boolean(expandedEvents[eventId]);
                      return (
                        <button
                          className="mt-1 text-[10px] text-orange-700 hover:underline"
                          onClick={() =>
                            setExpandedEvents((prev) => ({
                              ...prev,
                              [eventId]: !isExpanded,
                            }))
                          }
                        >
                          {isExpanded ? "Collapse context" : "Expand full context"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {visibleTimelineItems.length === 0 && (
              <div className="text-xs text-gray-400 border border-gray-100 rounded px-2 py-2">
                No execution logs yet for this task.
              </div>
            )}
            {useExecutionEvents && executionEventsPage?.hasMore && actorFilter === "All" && (
              <button
                className="w-full text-[11px] text-gray-500 py-2 border border-gray-100 rounded hover:bg-gray-50"
                onClick={() => setExecutionLimit((prev) => prev + 120)}
              >
                Load older execution logs
              </button>
            )}
          </div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                Review History ({reviews.length})
              </p>
              <div className="space-y-2">
                {reviews.map((review: TaskReview) => {
                  const reviewer = agents.find((a: Agent) => a._id === review.reviewerAgentId);
                  const pass = review.status === "pass";
                  return (
                    <div
                      key={review._id}
                      className={`border rounded p-2 ${pass ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40"}`}
                    >
                      <div className="flex items-center gap-2 text-[10px] mb-1">
                        <span className={pass ? "text-emerald-700" : "text-rose-700"}>
                          {pass ? "APPROVED" : "CHANGES REQUESTED"}
                        </span>
                        <span className="text-gray-500">
                          by {reviewer?.name ?? "Reviewer"} •{" "}
                          {formatRelativeTime(review.reviewedAt ?? review._creationTime)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700">{review.summary}</p>
                      {review.findings?.length > 0 && (
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {review.findings.map((finding: string, idx: number) => (
                            <li key={`${review._id}-${idx}`} className="text-xs text-gray-600">
                              {finding}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Automation runs */}
          {automationRuns.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                Automation Audit ({automationRuns.length})
              </p>
              <div className="space-y-1.5">
                {automationRuns.map((run: any) => (
                  <div key={run._id} className="text-[11px] text-gray-600 border border-gray-100 rounded px-2 py-1.5">
                    <span className="font-medium text-gray-800">{run.agentName}</span>{" "}
                    <span className="text-gray-500">
                      {run.role} / {run.dispatchType}
                    </span>{" "}
                    <span
                      className={
                        run.status === "failed"
                          ? "text-rose-600"
                          : run.status === "succeeded"
                            ? "text-emerald-600"
                            : "text-amber-600"
                      }
                    >
                      {run.status}
                    </span>
                    {run.outputSummary && (
                      <span className="text-gray-500"> — {run.outputSummary}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accountability */}
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              Task Accountability ({accountabilitySteps.length})
            </p>
            {taskHealth?.chiefOnlyRisk && (
              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded px-2 py-1.5 mb-2">
                Chief-only activity risk: no specialist proof accepted yet.
              </div>
            )}
            {taskHealth?.stale && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mb-2">
                Stale running step detected ({Math.floor((taskHealth.staleForMs ?? 0) / 60000)}m without progress).
              </div>
            )}
            {accountabilitySteps.length === 0 ? (
              <div className="text-xs text-gray-400 border border-gray-100 rounded px-2 py-2">
                Accountability ledger not initialized for this task yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {accountabilitySteps.map((step: TaskAgentStep) => {
                  const proofOk =
                    step.requiredProof === "output_path"
                      ? (step.proofPaths?.length ?? 0) > 0
                      : Boolean(step.proofSummary) ||
                        Boolean(step.proofMessageId) ||
                        (step.proofDocumentIds?.length ?? 0) > 0;
                  const latestRun = (step.dispatchRunIds?.length ?? 0) > 0;
                  return (
                    <div key={step._id} className="border border-gray-100 rounded px-2 py-2">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="font-medium text-gray-800">
                          #{step.stepIndex} {step.agentName} ({step.role})
                        </div>
                        <div
                          className={
                            step.status === "running"
                              ? "text-emerald-700"
                              : step.status === "blocked" || step.status === "failed"
                                ? "text-rose-700"
                                : "text-gray-600"
                          }
                        >
                          {step.status}
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-gray-500 grid grid-cols-2 gap-y-1">
                        <div>Last progress: {formatRelativeTime(step.lastProgressAt ?? step.startedAt ?? step._creationTime)}</div>
                        <div>
                          Proof:{" "}
                          <span className={proofOk ? "text-emerald-700" : "text-rose-700"}>
                            {proofOk ? "passed" : "missing"}
                          </span>
                        </div>
                        <div>
                          Required: {renderProofRequirementLabel(step.requiredProof, autoManagedArtifacts)}
                        </div>
                        <div>Dispatch runs: {latestRun ? step.dispatchRunIds?.length ?? 0 : 0}</div>
                        {step.handoffToAgentId && (
                          <div className="col-span-2">
                            Handoff: {step.handoffValid === false ? "invalid" : "valid"} •{" "}
                            {formatRelativeTime(step.handoffAt ?? step.lastProgressAt ?? step._creationTime)}
                          </div>
                        )}
                        {step.stuckReason && (
                          <div className="col-span-2 text-rose-600">Reason: {step.stuckReason}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Comment input */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full text-xs px-3 py-2 resize-none focus:outline-none"
              rows={3}
              placeholder="Add a comment... (@ to mention, # to link doc)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleComment();
                }
              }}
            />
            <div className="flex justify-end px-3 py-2 bg-gray-50 border-t border-gray-100">
              <button
                onClick={handleComment}
                disabled={!newComment.trim()}
                className="text-xs bg-orange-500 text-white px-4 py-1.5 rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
