import { formatRelativeTime, getActivityIcon } from "../../lib/utils";
import type { Activity } from "../../types";

interface FeedItemProps {
  activity: Activity;
  onClick?: () => void;
}

export function FeedItem({ activity, onClick }: FeedItemProps) {
  const icon = getActivityIcon(activity.type);

  const dotColor: Record<string, string> = {
    task_created: "bg-green-500",
    task_assigned: "bg-blue-500",
    task_status_changed: "bg-amber-500",
    message_sent: "bg-orange-400",
    document_created: "bg-purple-500",
    agent_started: "bg-green-500",
    agent_paused: "bg-yellow-500",
    heartbeat: "bg-gray-300",
    task_triaged: "bg-indigo-500",
    task_review_requested: "bg-violet-500",
    task_review_passed: "bg-emerald-500",
    task_review_failed: "bg-rose-500",
    chief_followup_sent: "bg-orange-500",
    telegram_intake_received: "bg-sky-500",
    telegram_status_sent: "bg-cyan-500",
    automation_error: "bg-red-600",
  };

  return (
    <div
      className={`flex gap-2.5 py-2 px-3 hover:bg-gray-50 transition-colors ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
    >
      {/* Dot */}
      <div className="flex flex-col items-center mt-1">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            dotColor[activity.type] ?? "bg-gray-400"
          }`}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-700 leading-snug">{activity.message}</p>
        {activity.taskTitle && (
          <button className="text-[10px] text-orange-600 hover:underline truncate block max-w-full mt-0.5">
            {activity.taskTitle}
          </button>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          {activity.agentName && (
            <span className="text-[10px] font-medium text-gray-500">
              {activity.agentName}
            </span>
          )}
          <span className="text-[10px] text-gray-400">
            {formatRelativeTime(activity._creationTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
