import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { KanbanBoard } from "./KanbanBoard";
import { cn, getStatusLabel } from "../../lib/utils";
import type { Agent, Task, TaskStatus, WorkflowKind } from "../../types";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";

const STATUS_TABS: Array<"all" | TaskStatus> = [
  "all",
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "waiting",
  "blocked",
  "done",
];

type QuickFilter = "all" | "no_specialist_proof" | "handoff_failed" | "agent_stuck";

const WORKFLOW_OPTIONS: WorkflowKind[] = [
  "general",
  "review",
  "debug",
  "incident",
  "architecture",
  "standup",
  "deploy_checklist",
];

interface MissionQueueProps {
  filterAgentId: Id<"agents"> | null;
  onTaskClick: (taskId: Id<"tasks">) => void;
}

export function MissionQueue({ filterAgentId, onTaskClick }: MissionQueueProps) {
  const [activeTab, setActiveTab] = useState<"all" | TaskStatus>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("Created from Mission Control dashboard.");
  const [priority, setPriority] = useState<"urgent" | "high" | "normal" | "low">("normal");
  const [workflowKind, setWorkflowKind] = useState<WorkflowKind>("general");
  const [labelText, setLabelText] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<Id<"agents">[]>([]);
  const [composeError, setComposeError] = useState<string | null>(null);
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];
  const routableAgents =
    (useQuery(api.agents.list, {
      includeRetired: false,
      routableOnly: true,
    }) ?? []) as Agent[];
  const queueSignals = (useQuery((api as any).accountability.queueSignals, {
    staleMinutes: 10,
  }) ?? {
    noSpecialistProofTaskIds: [],
    handoffFailedTaskIds: [],
    agentStuckTaskIds: [],
  }) as {
    noSpecialistProofTaskIds: Id<"tasks">[];
    handoffFailedTaskIds: Id<"tasks">[];
    agentStuckTaskIds: Id<"tasks">[];
  };
  const createTask = useMutation(api.tasks.create);

  const resetComposer = () => {
    setTitle("");
    setDescription("Created from Mission Control dashboard.");
    setPriority("normal");
    setWorkflowKind("general");
    setLabelText("");
    setAssigneeIds([]);
    setComposeError(null);
  };

  const closeComposer = () => {
    setShowTaskComposer(false);
    resetComposer();
  };

  const toggleAssignee = (agentId: Id<"agents">) => {
    setAssigneeIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  };

  const handleCreateTask = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setComposeError("Task title is required.");
      return;
    }
    const labels = labelText
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);

    setComposeError(null);
    try {
      const taskId = await createTask({
        title: trimmedTitle,
        description: description.trim() || "Created from Mission Control dashboard.",
        priority,
        labels,
        assigneeIds,
        workflowKind,
      });
      closeComposer();
      onTaskClick(taskId);
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "Failed to create task.");
    }
  };

  const getCounts = (status: "all" | TaskStatus) => {
    if (status === "all") return tasks.length;
    return tasks.filter((t: Task) => t.status === status).length;
  };

  const quickFilterTaskIds =
    quickFilter === "no_specialist_proof"
      ? queueSignals.noSpecialistProofTaskIds
      : quickFilter === "handoff_failed"
        ? queueSignals.handoffFailedTaskIds
        : quickFilter === "agent_stuck"
          ? queueSignals.agentStuckTaskIds
          : [];

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Mission Queue
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {tasks.filter((t: Task) => t.status !== "done").length} active
          </span>
          <button
            onClick={() => setShowTaskComposer(true)}
            className="flex items-center gap-1 text-xs bg-orange-500 text-white px-3 py-1.5 rounded hover:bg-orange-600 transition-colors font-medium"
          >
            + New
          </button>
        </div>
      </div>

      {/* Tab Filters */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
        {STATUS_TABS.map((status) => {
          const count = getCounts(status);
          return (
            <TabFilter
              key={status}
              label={status === "all" ? "All" : getStatusLabel(status as TaskStatus)}
              count={count}
              active={activeTab === status}
              onClick={() => setActiveTab(status)}
              status={status}
            />
          );
        })}
      </div>

      {/* Accountability quick filters */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 flex-shrink-0 overflow-x-auto">
        <QuickFilterBtn
          label="All"
          count={tasks.length}
          active={quickFilter === "all"}
          onClick={() => setQuickFilter("all")}
        />
        <QuickFilterBtn
          label="No Specialist Proof"
          count={queueSignals.noSpecialistProofTaskIds.length}
          active={quickFilter === "no_specialist_proof"}
          onClick={() => setQuickFilter("no_specialist_proof")}
        />
        <QuickFilterBtn
          label="Handoff Failed"
          count={queueSignals.handoffFailedTaskIds.length}
          active={quickFilter === "handoff_failed"}
          onClick={() => setQuickFilter("handoff_failed")}
        />
        <QuickFilterBtn
          label="Agent Stuck"
          count={queueSignals.agentStuckTaskIds.length}
          active={quickFilter === "agent_stuck"}
          onClick={() => setQuickFilter("agent_stuck")}
        />
      </div>

      {/* Kanban Board */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-4">
        <KanbanBoard
          filterStatus={activeTab}
          filterAgentId={filterAgentId}
          quickFilterTaskIds={quickFilterTaskIds}
          onTaskClick={onTaskClick}
        />
      </div>

      {showTaskComposer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">Create Task</h3>
              <button
                onClick={closeComposer}
                className="text-lg leading-none text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Task title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-200"
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-200"
                  placeholder="Describe required output and acceptance criteria"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as "urgent" | "high" | "normal" | "low")
                    }
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-200"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Workflow
                  </label>
                  <select
                    value={workflowKind}
                    onChange={(e) => setWorkflowKind(e.target.value as WorkflowKind)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-200"
                  >
                    {WORKFLOW_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Labels (comma separated)
                </label>
                <input
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-200"
                  placeholder="frontend, api, release"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Manual assignment
                </label>
                <div className="max-h-44 overflow-y-auto rounded border border-gray-100 bg-gray-50 p-2">
                  <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                    {routableAgents.map((agent) => (
                      <label
                        key={agent._id}
                        className="flex cursor-pointer items-center gap-2 rounded bg-white px-2 py-1.5 text-xs text-gray-700 hover:bg-orange-50"
                      >
                        <input
                          type="checkbox"
                          checked={assigneeIds.includes(agent._id)}
                          onChange={() => toggleAssignee(agent._id)}
                        />
                        <span>{agent.emoji}</span>
                        <span className="font-medium">{agent.name}</span>
                        <span className="ml-auto text-[10px] text-gray-400">{agent.roleKey}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-gray-500">
                  Leave empty to route through Inbox triage.
                </p>
              </div>

              {composeError && <p className="text-xs text-rose-600">{composeError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                onClick={closeComposer}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                className="rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickFilterBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors border",
        active
          ? "bg-orange-600 text-white border-orange-600"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800"
      )}
    >
      {label}
      <span className={cn("text-[10px] font-bold", active ? "text-orange-100" : "text-gray-400")}>
        {count}
      </span>
    </button>
  );
}

function TabFilter({
  label,
  count,
  active,
  onClick,
  status,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  status: "all" | TaskStatus;
}) {
  const dotColor: Record<string, string> = {
    inbox: "bg-gray-400",
    assigned: "bg-orange-500",
    in_progress: "bg-green-500",
    review: "bg-amber-500",
    waiting: "bg-yellow-500",
    blocked: "bg-red-500",
    done: "bg-gray-300",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
        active
          ? "bg-gray-800 text-white border-gray-800"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800"
      )}
    >
      {status !== "all" && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            active ? "bg-white" : dotColor[status] ?? "bg-gray-400"
          )}
        />
      )}
      {label}
      {count > 0 && (
        <span
          className={cn(
            "text-[10px] font-bold",
            active ? "text-gray-300" : "text-gray-400"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
