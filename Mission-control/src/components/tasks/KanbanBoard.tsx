import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { TaskCardWithAssignees } from "./TaskCard";
import { getStatusColumnStyle, getStatusLabel } from "../../lib/utils";
import type { Task, TaskStatus } from "../../types";
import type { Id } from "../../../convex/_generated/dataModel";

const COLUMNS: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "waiting",
  "blocked",
  "done",
];

interface KanbanBoardProps {
  filterStatus: TaskStatus | "all";
  filterAgentId: Id<"agents"> | null;
  quickFilterTaskIds: Id<"tasks">[];
  onTaskClick: (taskId: Id<"tasks">) => void;
}

export function KanbanBoard({
  filterStatus,
  filterAgentId,
  quickFilterTaskIds,
  onTaskClick,
}: KanbanBoardProps) {
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];
  const quickFilterSet = new Set((quickFilterTaskIds ?? []).map((id) => String(id)));

  const filteredTasks = tasks.filter((task: Task) => {
    if (filterAgentId && !task.assigneeIds.includes(filterAgentId)) return false;
    if (quickFilterSet.size > 0 && !quickFilterSet.has(String(task._id))) return false;
    return true;
  });

  const columnsToShow =
    filterStatus !== "all" ? [filterStatus] : COLUMNS;

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden pb-4">
      {columnsToShow.map((status) => {
        const columnTasks = filteredTasks.filter((t: Task) => t.status === status);
        const colStyle = getStatusColumnStyle(status);

        return (
          <KanbanColumn
            key={status}
            status={status}
            tasks={columnTasks}
            dotColor={colStyle.dot}
            textColor={colStyle.headerText}
            onTaskClick={onTaskClick}
          />
        );
      })}
    </div>
  );
}

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  dotColor: string;
  textColor: string;
  onTaskClick: (taskId: Id<"tasks">) => void;
}

function KanbanColumn({
  status,
  tasks,
  dotColor,
  textColor,
  onTaskClick,
}: KanbanColumnProps) {
  const taskList = tasks ?? [];
  return (
    <div className="flex-shrink-0 w-[260px] h-full min-h-0 flex flex-col">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-0.5">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${textColor}`}>
          {getStatusLabel(status)}
        </span>
        <span className="text-[10px] text-gray-400 ml-auto">{taskList.length}</span>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {taskList.length === 0 ? (
          <div className="border-2 border-dashed border-gray-100 rounded-lg h-12 flex items-center justify-center">
            <span className="text-[10px] text-gray-300">—</span>
          </div>
        ) : (
          taskList.map((task: Task) => (
            <TaskCardWithAssignees
              key={task._id}
              task={task}
              onClick={() => onTaskClick(task._id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
