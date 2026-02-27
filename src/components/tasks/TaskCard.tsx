import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PriorityBadge } from "../shared/PriorityBadge";
import { AgentAvatar } from "../agents/AgentCard";
import { formatRelativeTime } from "../../lib/utils";
import type { Agent, Task } from "../../types";
import type { Id } from "../../../convex/_generated/dataModel";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  assignees?: { emoji: string; name: string }[];
}

export function TaskCard({ task, onClick, assignees = [] }: TaskCardProps) {
  const descPreview = task.description
    .replace(/\*\*/g, "")
    .replace(/#+\s/g, "")
    .slice(0, 100);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-orange-300 hover:shadow-sm transition-all mb-2 group"
    >
      {/* Priority + Labels */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <PriorityBadge priority={task.priority} />
        {task.labels.slice(0, 3).map((label) => (
          <span
            key={label}
            className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium"
          >
            {label}
          </span>
        ))}
        {task.source === "telegram" && (
          <span className="text-[9px] px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded font-medium">
            telegram
          </span>
        )}
        {task.reviewStatus === "in_review" && (
          <span className="text-[9px] px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded font-medium">
            under-review
          </span>
        )}
        {task.nextCheckAt && task.nextCheckAt < Date.now() && task.status !== "done" && (
          <span className="text-[9px] px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded font-medium">
            stale
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-xs font-semibold text-gray-800 leading-snug mb-1 group-hover:text-orange-700">
        {task.title}
      </p>

      {/* Description preview */}
      {descPreview && (
        <p className="text-[11px] text-gray-500 leading-relaxed mb-2 line-clamp-2">
          {descPreview}
          {task.description.length > 100 && "…"}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2">
        {/* Assignee avatars */}
        <div className="flex -space-x-1">
          {assignees.slice(0, 3).map((a, i) => (
            <AgentAvatar key={i} emoji={a.emoji} size="xs" />
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto text-[10px] text-gray-400">
          {(task.commentCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <span>💬</span>
              <span>{task.commentCount}</span>
            </span>
          )}
          {(task.attachmentCount ?? 0) > 0 && (
            <span className="flex items-center gap-0.5">
              <span>📎</span>
              <span>{task.attachmentCount}</span>
            </span>
          )}
          <span>{formatRelativeTime(task._creationTime)}</span>
        </div>
      </div>
    </button>
  );
}

export function TaskCardWithAssignees({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const agents = (useQuery(api.agents.list) ?? []) as Agent[];
  const assignees = task.assigneeIds
    .map((id) => agents.find((a) => a._id === id))
    .filter(Boolean)
    .map((a) => ({ emoji: a!.emoji, name: a!.name }));

  return <TaskCard task={task} onClick={onClick} assignees={assignees} />;
}

export function AssigneeChip({ agentId }: { agentId: Id<"agents"> }) {
  const agent = useQuery(api.agents.get, { id: agentId });
  if (!agent) return null;

  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-500">
      <AgentAvatar emoji={agent.emoji} size="xs" />
      <span>{agent.name}</span>
    </div>
  );
}
