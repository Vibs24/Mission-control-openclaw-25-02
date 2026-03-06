import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { formatRelativeTime } from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Agent, ChatMessage, ExecutionEvent, Task } from "../../types";

interface SquadChatProps {
  taskId?: Id<"tasks">;
  onClose: () => void;
}

type TimelineRow = {
  id: string;
  at: number;
  fromName: string;
  fromEmoji: string;
  content: string;
  source: "chat" | "event";
};

function formatEventAsChatContent(event: ExecutionEvent) {
  const lines: string[] = [];
  if (event.summary) lines.push(event.summary);
  if (event.workDone) lines.push(`Done: ${event.workDone}`);
  if (event.workingNow) lines.push(`Doing: ${event.workingNow}`);
  if (event.nextSteps) lines.push(`Next: ${event.nextSteps}`);
  if (event.blockers) lines.push(`Blockers: ${event.blockers}`);
  if ((event.evidencePaths?.length ?? 0) > 0) {
    lines.push(`Evidence: ${(event.evidencePaths ?? []).slice(0, 2).join(" | ")}`);
  }
  if (lines.length === 0 && event.title) lines.push(event.title);
  return lines.join("\n");
}

function eventRoleEmoji(role: string) {
  if (role === "chief") return "👑";
  if (role === "project_manager") return "📋";
  if (role === "reviewer") return "✅";
  if (role === "specialist") return "💻";
  return "📌";
}

export function SquadChat({ taskId, onClose }: SquadChatProps) {
  const defaultChannel = taskId ? `task:${String(taskId)}` : "general";
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState(defaultChannel);
  const [channelInitialized, setChannelInitialized] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];
  const agents =
    (useQuery(api.agents.list, { includeRetired: true, routableOnly: false }) ?? []) as Agent[];
  const messages = (useQuery(api.chat.list, { channel, limit: 200 }) ?? []) as ChatMessage[];
  const selectedTaskId = channel.startsWith("task:")
    ? (channel.slice(5) as Id<"tasks">)
    : undefined;
  const eventPage = (useQuery(
    (api as any).executionEvents.listByTask,
    selectedTaskId
      ? {
          taskId: selectedTaskId,
          limit: 120,
        }
      : "skip"
  ) ?? null) as { events: ExecutionEvent[] } | null;
  const sendMessage = useMutation(api.chat.send);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [String(agent._id), agent])),
    [agents]
  );
  const agentsByName = useMemo(
    () => new Map(agents.map((agent) => [String(agent.name || "").toLowerCase(), agent])),
    [agents]
  );
  const taskChannels = useMemo(() => {
    const active = tasks
      .filter((task) => task.status !== "done")
      .slice(0, 40)
      .map((task) => ({
        channel: `task:${String(task._id)}`,
        label: `#task/${String(task._id).slice(0, 8)} • ${task.title.slice(0, 42)}`,
      }));
    if (selectedTaskId) {
      const existing = active.some((row) => row.channel === channel);
      if (!existing) {
        const task = tasks.find((row) => String(row._id) === String(selectedTaskId));
        if (task) {
          active.unshift({
            channel: `task:${String(task._id)}`,
            label: `#task/${String(task._id).slice(0, 8)} • ${task.title.slice(0, 42)}`,
          });
        }
      }
    }
    return active;
  }, [tasks, selectedTaskId, channel]);

  useEffect(() => {
    if (channelInitialized) return;
    if (taskId) {
      setChannel(`task:${String(taskId)}`);
      setChannelInitialized(true);
      return;
    }
    if (taskChannels.length > 0) {
      setChannel(taskChannels[0].channel);
    }
    setChannelInitialized(true);
  }, [channelInitialized, taskChannels, taskId]);

  const eventRows = useMemo(() => {
    if (!selectedTaskId) return [] as TimelineRow[];
    return (eventPage?.events ?? []).map((event) => {
      const actor =
        (event.actorAgentId ? agentsById.get(String(event.actorAgentId)) : undefined) ??
        agentsByName.get(String(event.actorName || "").toLowerCase());
      return {
        id: `event-${String(event._id)}`,
        at: Number(event.createdAt || event._creationTime || Date.now()),
        fromName: event.actorName,
        fromEmoji: actor?.emoji ?? eventRoleEmoji(event.actorRole),
        content: formatEventAsChatContent(event),
        source: "event" as const,
      };
    });
  }, [agentsById, agentsByName, eventPage?.events, selectedTaskId]);

  const chatRows = useMemo(() => {
    return messages.map((msg) => ({
      id: `chat-${String(msg._id)}`,
      at: Number(msg._creationTime || Date.now()),
      fromName: msg.fromName,
      fromEmoji: msg.fromEmoji,
      content: msg.content,
      source: "chat" as const,
    }));
  }, [messages]);

  const timelineRows = useMemo(() => {
    const merged = [...chatRows, ...eventRows];
    merged.sort((a, b) => a.at - b.at);
    return merged.slice(-250);
  }, [chatRows, eventRows]);

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [timelineRows.length, channel]);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setSendError(null);
    setIsSending(true);
    try {
      await sendMessage({
        fromName: "Sypha",
        fromEmoji: "👤",
        content: message,
        channel,
      });
      setMessage("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Failed to send chat message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Panel title="Squad Chat" onClose={onClose}>
      <div className="flex flex-col h-full">
        {/* Channel indicator */}
        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-300"
          >
            <option value="general"># general</option>
            {taskChannels.map((row) => (
              <option key={row.channel} value={row.channel}>
                {row.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400">
            {selectedTaskId ? "task channel" : "global"}
          </span>
        </div>

        {/* Messages */}
        <div ref={messageListRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {timelineRows.length === 0 && (
            <div className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              No messages yet. Use this channel to coordinate work and blockers.
            </div>
          )}
          {timelineRows.map((msg) => (
            <div key={msg.id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                {msg.fromEmoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-semibold text-gray-800">
                    {msg.fromName}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      msg.source === "event"
                        ? "bg-sky-50 text-sky-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {msg.source === "event" ? "execution" : "chat"}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatRelativeTime(msg.at)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          {sendError && (
            <p className="mb-2 text-[10px] text-red-500">{sendError}</p>
          )}
          <div className="flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              className="flex-1 text-xs border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300"
              placeholder={
                selectedTaskId ? "Message the squad about this task..." : "Message the squad..."
              }
            />
            <button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              className="text-xs bg-orange-500 text-white px-3 py-2 rounded hover:bg-orange-600 disabled:opacity-40 transition-colors"
            >
              {isSending ? "..." : "→"}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
