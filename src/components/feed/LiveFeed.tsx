import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FeedItem } from "./FeedItem";
import { cn } from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Activity, Agent } from "../../types";

interface LiveFeedProps {
  onTaskClick?: (taskId: Id<"tasks">) => void;
}

export function LiveFeed({ onTaskClick }: LiveFeedProps) {
  const [filterType, setFilterType] = useState<"all" | "tasks" | "comments" | "decisions">("all");
  const [filterAgentId, setFilterAgentId] = useState<Id<"agents"> | null>(null);

  const agents = (useQuery(api.agents.list) ?? []) as Agent[];
  const activities = (useQuery(api.activities.list, {
    agentId: filterAgentId ?? undefined,
    limit: 60,
  }) ?? []) as Activity[];

  const filteredActivities = activities.filter((a: Activity) => {
    if (filterType === "tasks") {
      return ["task_created", "task_assigned", "task_status_changed"].includes(a.type);
    }
    if (filterType === "comments") {
      return a.type === "message_sent";
    }
    if (filterType === "decisions") {
      return [
        "document_created",
        "task_review_requested",
        "task_review_passed",
        "task_review_failed",
      ].includes(a.type);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full border-l border-gray-200 w-[280px] flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
          Live Feed
        </span>
        <span className="ml-auto text-[9px] text-gray-400 animate-pulse font-medium">
          ● LIVE
        </span>
      </div>

      {/* Type filters */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100 overflow-x-auto">
        {(["all", "tasks", "comments", "decisions"] as const).map((type) => {
          const count = activities.filter((a: Activity) => {
            if (type === "all") return true;
            if (type === "tasks")
              return ["task_created", "task_assigned", "task_status_changed"].includes(a.type);
            if (type === "comments") return a.type === "message_sent";
            if (type === "decisions")
              return [
                "document_created",
                "task_review_requested",
                "task_review_passed",
                "task_review_failed",
              ].includes(a.type);
            return false;
          }).length;

          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium transition-colors",
                filterType === type
                  ? "bg-gray-800 text-white"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              {count > 0 && (
                <span
                  className={cn(
                    "ml-1",
                    filterType === type ? "text-gray-300" : "text-gray-400"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Agent filters */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100 overflow-x-auto">
        <button
          onClick={() => setFilterAgentId(null)}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium",
            filterAgentId === null ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:text-gray-600"
          )}
        >
          All Agents
        </button>
        {agents.map((agent: Agent) => (
          <button
            key={agent._id}
            onClick={() =>
              setFilterAgentId(filterAgentId === agent._id ? null : agent._id)
            }
            className={cn(
              "text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium",
              filterAgentId === agent._id
                ? "bg-gray-200 text-gray-700"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            {agent.name}
          </button>
        ))}
      </div>

      {/* Feed items */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {filteredActivities.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-8">
            No activity yet
          </p>
        ) : (
          filteredActivities.map((activity: Activity) => (
            <FeedItem
              key={activity._id}
              activity={activity}
              onClick={
                activity.taskId ? () => onTaskClick?.(activity.taskId!) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
