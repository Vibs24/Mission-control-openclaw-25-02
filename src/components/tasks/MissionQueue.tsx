import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { KanbanBoard } from "./KanbanBoard";
import { cn, getStatusLabel } from "../../lib/utils";
import type { Task, TaskStatus } from "../../types";
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

interface MissionQueueProps {
  filterAgentId: Id<"agents"> | null;
  onTaskClick: (taskId: Id<"tasks">) => void;
}

export function MissionQueue({ filterAgentId, onTaskClick }: MissionQueueProps) {
  const [activeTab, setActiveTab] = useState<"all" | TaskStatus>("all");
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];
  const createTask = useMutation(api.tasks.create);

  const handleNewTask = async () => {
    const title = window.prompt("Task title");
    if (!title || !title.trim()) return;
    const description =
      window.prompt("Task description", "Created from Mission Control dashboard.") ??
      "Created from Mission Control dashboard.";
    const taskId = await createTask({
      title: title.trim(),
      description: description.trim(),
      priority: "normal",
      labels: [],
      assigneeIds: [],
    });
    onTaskClick(taskId);
  };

  const getCounts = (status: "all" | TaskStatus) => {
    if (status === "all") return tasks.length;
    return tasks.filter((t: Task) => t.status === status).length;
  };

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
            onClick={handleNewTask}
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

      {/* Kanban Board */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 pt-4">
        <KanbanBoard
          filterStatus={activeTab}
          filterAgentId={filterAgentId}
          onTaskClick={onTaskClick}
        />
      </div>
    </div>
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
