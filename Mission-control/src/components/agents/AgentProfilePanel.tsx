import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { getAgentStatusStyle, formatRelativeTime, getOpenClawAgentId } from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  Activity,
  AgentProofCompliance,
  AgentWorkloadSnapshot,
  Notification,
  Task,
  TaskAgentStep,
} from "../../types";

interface AgentProfilePanelProps {
  agentId: Id<"agents">;
  onClose: () => void;
  onTaskClick?: (taskId: Id<"tasks">) => void;
}

export function AgentProfilePanel({
  agentId,
  onClose,
  onTaskClick,
}: AgentProfilePanelProps) {
  const [tab, setTab] = useState<"attention" | "timeline">("attention");
  const agent = useQuery(api.agents.get, { id: agentId });
  const activities = (useQuery(api.activities.list, { agentId, limit: 20 }) ?? []) as Activity[];
  const notifications = (useQuery(api.notifications.listByAgent, {
    agentId,
    delivered: false,
  }) ?? []) as Notification[];
  const currentSteps =
    (useQuery((api as any).accountability.currentByAgent, { agentId }) ?? []) as TaskAgentStep[];
  const workloadRows =
    (useQuery((api as any).accountability.agentWorkloadSnapshot, {}) ?? []) as AgentWorkloadSnapshot[];
  const proofRows =
    (useQuery((api as any).accountability.proofComplianceByAgent, { windowHours: 24 }) ?? []) as AgentProofCompliance[];
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];
  const workload = workloadRows.find((row) => row.agentId === agentId);
  const proof = proofRows.find((row) => row.agentId === agentId);
  const tasksById = new Map(tasks.map((task) => [String(task._id), task]));
  const markDelivered = useMutation(api.notifications.markDelivered);

  if (!agent) return null;

  const statusStyle = getAgentStatusStyle(agent.status);
  const openclawAgentId = getOpenClawAgentId(agent.sessionKey);

  return (
    <Panel title="Agent Profile" onClose={onClose}>
      <div className="p-4">
        {/* Agent Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
              {agent.emoji}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusStyle.dot}`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base">{agent.name}</div>
            <div className="text-xs text-gray-500">{agent.role}</div>
            {openclawAgentId && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                OpenClaw Agent ID: <code>{openclawAgentId}</code>
              </div>
            )}
            <span
              className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${statusStyle.badge}`}
            >
              ● {statusStyle.label}
            </span>
          </div>
          <button
            disabled
            className="text-xs text-gray-300 border border-gray-200 px-3 py-1.5 rounded cursor-not-allowed"
            title="Agent pause control not wired yet"
          >
            ⏸ Pause
          </button>
        </div>

        {/* Bio */}
        <p className="text-xs text-gray-600 leading-relaxed mb-4 border-l-2 border-orange-200 pl-3">
          {agent.bio}
        </p>

        {/* Role & Specialty */}
        <div className="mb-5 border border-gray-100 rounded-lg p-3 bg-white">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
            Role & Specialty
          </p>
          <div className="space-y-1 text-[11px] text-gray-600">
            <div>
              Role Key: <span className="font-semibold text-gray-800">{agent.roleKey ?? "legacy"}</span>
            </div>
            <div>
              Specialty: <span className="text-gray-800">{agent.specialty || agent.role}</span>
            </div>
            <div>
              Routing State:{" "}
              <span className="font-semibold text-gray-800">
                {agent.retired === true || agent.routable === false ? "Retired / Non-routable" : "Routable"}
              </span>
            </div>
            <div>
              Session Key: <code>{agent.sessionKey}</code>
            </div>
            <div>
              Responsibilities: {agent.skills.slice(0, 5).join(", ")}
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {agent.skills.map((skill: string) => (
            <span
              key={skill}
              className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
            >
              {skill}
            </span>
          ))}
        </div>

        {/* Accountability Snapshot */}
        <div className="mb-5 border border-gray-100 rounded-lg p-3 bg-white">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
            Accountability Snapshot
          </p>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
            <div>Running tasks: {workload?.runningCount ?? 0}</div>
            <div>Queued tasks: {workload?.queuedCount ?? 0}</div>
            <div>Stuck (24h): {workload?.stuckCount24h ?? 0}</div>
            <div>
              Last proof: {workload?.lastProofAt ? formatRelativeTime(workload.lastProofAt) : "none"}
            </div>
            <div>
              Last worklog:{" "}
              {workload?.lastStructuredWorklogAt
                ? formatRelativeTime(workload.lastStructuredWorklogAt)
                : "none"}
            </div>
            <div>Proof checks (24h): {proof?.totalProofChecks ?? 0}</div>
            <div>Proof compliance: {Math.round((proof?.complianceRate ?? 1) * 100)}%</div>
          </div>
          {currentSteps.length > 0 && (
            <div className="mt-2 space-y-1">
              {currentSteps.slice(0, 3).map((step) => (
                <div key={step._id} className="text-[10px] text-gray-500">
                  #{step.stepIndex} • {step.status} • {step.agentName} •{" "}
                  {tasksById.get(String(step.taskId))?.workflowKind ?? "general"} •{" "}
                  {String(step.taskId).slice(0, 8)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          <TabBtn
            label="Attention"
            count={notifications.length}
            active={tab === "attention"}
            onClick={() => setTab("attention")}
          />
          <TabBtn
            label="Timeline"
            active={tab === "timeline"}
            onClick={() => setTab("timeline")}
          />
        </div>

        {/* Attention Tab */}
        {tab === "attention" && (
          <div>
            {notifications.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                No unread mentions
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                  Unread Mentions ({notifications.length})
                </p>
                {notifications.map((notif: Notification) => (
                  <div
                    key={notif._id}
                    className="border-l-2 border-orange-300 pl-3 py-1"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {notif.fromAgentName ?? "System"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatRelativeTime(notif._creationTime)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{notif.content}</p>
                    {notif.taskTitle && (
                      <button
                        className="text-[10px] text-orange-600 mt-1 hover:underline"
                        onClick={() =>
                          notif.taskId && onTaskClick?.(notif.taskId)
                        }
                      >
                        in: {notif.taskTitle}
                      </button>
                    )}
                    <button
                      onClick={() => markDelivered({ id: notif._id })}
                      className="block text-[10px] text-gray-400 mt-1 hover:text-gray-600"
                    >
                      Mark as read
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab */}
        {tab === "timeline" && (
          <div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                No recent activity
              </p>
            ) : (
              activities.map((activity: Activity) => (
                <div key={activity._id} className="flex gap-2 py-1">
                  <span className="text-gray-400 text-xs mt-0.5 flex-shrink-0">
                    →
                  </span>
                  <div>
                    <p className="text-xs text-gray-700">{activity.message}</p>
                    <span className="text-[10px] text-gray-400">
                      {formatRelativeTime(activity._creationTime)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Message Input */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-2">
            Message {agent.name} (@ to mention)
          </label>
          <input
            className="w-full text-xs border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300"
            placeholder={`Message ${agent.name}...`}
          />
        </div>
      </div>
    </Panel>
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-orange-500 text-orange-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">
          {count}
        </span>
      )}
    </button>
  );
}
