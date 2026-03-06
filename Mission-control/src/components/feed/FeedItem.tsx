import { formatRelativeTime, getActivityIcon } from "../../lib/utils";
import type { Activity, ExecutionEvent } from "../../types";

interface FeedItemProps {
  event?: ExecutionEvent;
  activity?: Activity;
  onTaskClick?: () => void;
  onExecutionEventClick?: () => void;
}

function eventDotColor(kind: string, severity: string) {
  if (severity === "error") return "bg-red-600";
  if (severity === "warning") return "bg-amber-500";
  if (severity === "success") return "bg-emerald-500";
  if (kind === "review") return "bg-violet-500";
  if (kind === "handoff") return "bg-indigo-500";
  if (kind === "heartbeat") return "bg-sky-500";
  return "bg-gray-500";
}

function activityDotColor(type: string) {
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
  return dotColor[type] ?? "bg-gray-400";
}

export function FeedItem({ event, activity, onTaskClick, onExecutionEventClick }: FeedItemProps) {
  if (event) {
    const dot = eventDotColor(String(event.kind || ""), String(event.severity || "info"));
    return (
      <div
        className={`flex gap-2.5 py-2 px-3 hover:bg-gray-50 transition-colors ${
          onExecutionEventClick ? "cursor-pointer" : ""
        }`}
        onClick={onExecutionEventClick}
      >
        <div className="flex flex-col items-center mt-1">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-800 leading-snug">{event.title}</p>
          <p className="text-[10px] text-gray-600 leading-snug mt-0.5">{event.summary}</p>

          <div className="mt-1 space-y-0.5">
            {event.workDone && (
              <p className="text-[10px] text-gray-500 truncate">Done: {event.workDone}</p>
            )}
            {event.workingNow && (
              <p className="text-[10px] text-gray-500 truncate">Doing: {event.workingNow}</p>
            )}
            {event.nextSteps && (
              <p className="text-[10px] text-gray-500 truncate">Next: {event.nextSteps}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] font-medium text-gray-500">{event.actorName}</span>
            <span className="text-[10px] uppercase text-gray-400">{event.kind}</span>
            <span className="text-[10px] text-gray-400">
              {formatRelativeTime(event.createdAt || event._creationTime)}
            </span>
          </div>

          {onTaskClick && event.taskId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskClick();
              }}
              className="text-[10px] text-orange-600 hover:underline truncate block max-w-full mt-0.5"
            >
              Open task
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!activity) return null;

  const icon = getActivityIcon(activity.type);

  return (
    <div
      className={`flex gap-2.5 py-2 px-3 hover:bg-gray-50 transition-colors ${
        onTaskClick ? "cursor-pointer" : ""
      }`}
      onClick={onTaskClick}
    >
      <div className="flex flex-col items-center mt-1">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${activityDotColor(activity.type)}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-700 leading-snug">{activity.message}</p>
        {activity.taskTitle && (
          <button className="text-[10px] text-orange-600 hover:underline truncate block max-w-full mt-0.5">
            {activity.taskTitle}
          </button>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          {activity.agentName && (
            <span className="text-[10px] font-medium text-gray-500">{activity.agentName}</span>
          )}
          <span className="text-[10px] text-gray-400">{formatRelativeTime(activity._creationTime)}</span>
          <span className="text-[10px] text-gray-300">{icon}</span>
        </div>
      </div>
    </div>
  );
}
