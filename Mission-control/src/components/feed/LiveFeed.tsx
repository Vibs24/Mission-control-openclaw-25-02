import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FeedItem } from "./FeedItem";
import { cn } from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Activity, Agent, ExecutionEvent } from "../../types";

interface LiveFeedProps {
  onTaskClick?: (taskId: Id<"tasks">) => void;
  onExecutionEventClick?: (eventId: Id<"executionEvents">) => void;
}

const PAGE_SIZE = 40;

function dedupeEvents(events: ExecutionEvent[]) {
  const seen = new Set<string>();
  const out: ExecutionEvent[] = [];
  for (const row of events) {
    const key = String(row._id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function mapFilterKinds(type: "all" | "tasks" | "comments" | "decisions") {
  if (type === "tasks") {
    return ["triage", "dispatch", "handoff", "recovery", "system"] as const;
  }
  if (type === "comments") {
    return ["worklog", "heartbeat", "proof"] as const;
  }
  if (type === "decisions") {
    return ["review"] as const;
  }
  return [] as const;
}

export function LiveFeed({ onTaskClick, onExecutionEventClick }: LiveFeedProps) {
  const [filterType, setFilterType] = useState<"all" | "tasks" | "comments" | "decisions">("all");
  const [filterAgentId, setFilterAgentId] = useState<Id<"agents"> | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadedEvents, setLoadedEvents] = useState<ExecutionEvent[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const agents = (useQuery(api.agents.list, { includeRetired: true }) ?? []) as Agent[];
  const fallbackActivities = (useQuery(api.activities.list, {
    agentId: filterAgentId ?? undefined,
    limit: 60,
  }) ?? []) as Activity[];

  const eventKinds = mapFilterKinds(filterType);
  const eventPage = (useQuery((api as any).executionEvents.listRecent, {
    limit: PAGE_SIZE,
    cursor: cursor ?? undefined,
    agentId: filterAgentId ?? undefined,
    kinds: eventKinds.length > 0 ? [...eventKinds] : undefined,
  }) ?? null) as { events: ExecutionEvent[]; hasMore: boolean; nextCursor?: number } | null;

  useEffect(() => {
    setCursor(null);
    setLoadedEvents([]);
    setHasMore(true);
  }, [filterType, filterAgentId]);

  useEffect(() => {
    if (!eventPage) return;
    if (cursor === null) {
      setLoadedEvents(dedupeEvents(eventPage.events ?? []));
    } else {
      setLoadedEvents((prev) => dedupeEvents([...(prev ?? []), ...(eventPage.events ?? [])]));
    }
    setHasMore(Boolean(eventPage.hasMore));
  }, [eventPage, cursor]);

  const filteredFallbackActivities = useMemo(() => {
    return fallbackActivities.filter((a: Activity) => {
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
  }, [fallbackActivities, filterType]);

  const eventCountByFilter = useMemo(() => {
    const all = loadedEvents;
    const taskKinds = new Set<string>(mapFilterKinds("tasks"));
    const commentKinds = new Set<string>(mapFilterKinds("comments"));
    const decisionKinds = new Set<string>(mapFilterKinds("decisions"));
    const tasks = all.filter((e) => taskKinds.has(String(e.kind || ""))).length;
    const comments = all.filter((e) => commentKinds.has(String(e.kind || ""))).length;
    const decisions = all.filter((e) => decisionKinds.has(String(e.kind || ""))).length;
    return { all: all.length, tasks, comments, decisions };
  }, [loadedEvents]);

  const usingExecutionEvents = loadedEvents.length > 0 || Boolean(eventPage);

  return (
    <div className="flex flex-col h-full border-l border-gray-200 w-[320px] flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
          Live Feed
        </span>
        <span className="ml-auto text-[9px] text-gray-400 animate-pulse font-medium">● LIVE</span>
      </div>

      <div className="flex gap-1 px-3 py-1.5 border-b border-gray-100 overflow-x-auto">
        {(["all", "tasks", "comments", "decisions"] as const).map((type) => {
          const fallbackCount = fallbackActivities.filter((a: Activity) => {
            if (type === "all") return true;
            if (type === "tasks") {
              return ["task_created", "task_assigned", "task_status_changed"].includes(a.type);
            }
            if (type === "comments") return a.type === "message_sent";
            return ["document_created", "task_review_requested", "task_review_passed", "task_review_failed"].includes(
              a.type
            );
          }).length;
          const count = usingExecutionEvents ? eventCountByFilter[type] : fallbackCount;

          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium transition-colors",
                filterType === type ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
              {count > 0 && <span className={cn("ml-1", filterType === type ? "text-gray-300" : "text-gray-400")}>{count}</span>}
            </button>
          );
        })}
      </div>

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
            onClick={() => setFilterAgentId(filterAgentId === agent._id ? null : agent._id)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded whitespace-nowrap font-medium",
              filterAgentId === agent._id ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:text-gray-600"
            )}
          >
            {agent.name}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto divide-y divide-gray-50"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!hasMore || !usingExecutionEvents) return;
          if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
          if (eventPage?.nextCursor && eventPage.nextCursor !== cursor) {
            setCursor(eventPage.nextCursor);
          }
        }}
      >
        {usingExecutionEvents ? (
          loadedEvents.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-8">No activity yet</p>
          ) : (
            <>
              {loadedEvents.map((event: ExecutionEvent) => (
                <FeedItem
                  key={event._id}
                  event={event}
                  onExecutionEventClick={
                    onExecutionEventClick ? () => onExecutionEventClick(event._id as Id<"executionEvents">) : undefined
                  }
                  onTaskClick={event.taskId ? () => onTaskClick?.(event.taskId as Id<"tasks">) : undefined}
                />
              ))}
              {hasMore && (
                <button
                  className="w-full text-[11px] text-gray-500 py-2 hover:bg-gray-50"
                  onClick={() => {
                    if (eventPage?.nextCursor) setCursor(eventPage.nextCursor);
                  }}
                >
                  Load older events
                </button>
              )}
            </>
          )
        ) : filteredFallbackActivities.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-8">No activity yet</p>
        ) : (
          filteredFallbackActivities.map((activity: Activity) => (
            <FeedItem
              key={activity._id}
              activity={activity}
              onTaskClick={activity.taskId ? () => onTaskClick?.(activity.taskId as Id<"tasks">) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
