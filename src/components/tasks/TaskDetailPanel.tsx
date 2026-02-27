import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { PriorityBadge } from "../shared/PriorityBadge";
import { AgentAvatar } from "../agents/AgentCard";
import {
  formatRelativeTime,
  getReviewStatusLabel,
  getStatusColor,
  getStatusLabel,
} from "../../lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Agent, Document, Message, TaskReview } from "../../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TaskDetailPanelProps {
  taskId: Id<"tasks">;
  onClose: () => void;
}

export function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const [newComment, setNewComment] = useState("");
  const [showContent, setShowContent] = useState(false);

  const task = useQuery(api.tasks.get, { id: taskId });
  const messages = (useQuery(api.messages.listByTask, { taskId }) ?? []) as Message[];
  const agents = (useQuery(api.agents.list) ?? []) as Agent[];
  const documents = (useQuery(api.documents.list, { taskId }) ?? []) as Document[];
  const reviews = (useQuery((api as any).reviews.listByTask, { taskId }) ?? []) as TaskReview[];
  const automationRuns =
    (useQuery((api as any).automation.listAutomationRunsByTask, { taskId }) ?? []) as any[];
  const createMessage = useMutation(api.messages.create);
  const archiveTask = useMutation(api.tasks.archive);

  if (!task) return null;

  const assignees = task.assigneeIds
    .map((id: Id<"agents">) => agents.find((a: Agent) => a._id === id))
    .filter(Boolean);

  const handleComment = async () => {
    if (!newComment.trim()) return;
    await createMessage({
      taskId,
      fromName: "Sypha",
      content: newComment,
    });
    setNewComment("");
  };

  return (
    <Panel title="Task Detail" onClose={onClose} width="w-[480px]">
      <div className="p-4">
        {/* Creator */}
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-3">
          <span>A</span>
          <span>by {assignees[0]?.name ?? "Jarvis"}</span>
        </div>

        {/* View Content toggle */}
        <button
          className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 mb-4"
          onClick={() => setShowContent(!showContent)}
        >
          <span>{showContent ? "▲" : "▼"}</span>
          <span>View content</span>
        </button>

        {showContent && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            {/* Task title as doc title */}
            <h2 className="text-base font-bold text-gray-900 mb-4">{task.title}</h2>

            {/* Description rendered as markdown */}
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {task.description}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <PriorityBadge priority={task.priority} />
          <span
            className={`text-xs font-medium ${getStatusColor(task.status)}`}
          >
            {getStatusLabel(task.status)}
          </span>
          {task.labels.map((label: string) => (
            <span
              key={label}
              className="text-[9px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-medium"
            >
              {label}
            </span>
          ))}
        </div>

        {/* Intake / automation metadata */}
        <div className="mb-4 p-3 bg-white border border-gray-100 rounded-lg space-y-2">
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-600">
            <span className="font-semibold uppercase tracking-wider text-gray-500">
              Source
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-100">
              {task.source ?? "manual"}
            </span>
            {task.source === "telegram" && task.requesterName && (
              <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700">
                Requester: {task.requesterName}
              </span>
            )}
            {task.reviewStatus && (
              <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700">
                {getReviewStatusLabel(task.reviewStatus)}
              </span>
            )}
            {task.automationState && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                {task.automationState.replaceAll("_", " ")}
              </span>
            )}
          </div>

          {task.nextAction && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Next Action
              </p>
              <p className="text-xs text-gray-700">{task.nextAction}</p>
            </div>
          )}

          {(task.nextCheckAt || task.lastChiefCheckAt || task.lastAssigneeUpdateAt) && (
            <div className="grid grid-cols-1 gap-1 text-[10px] text-gray-500">
              {task.nextCheckAt && (
                <div>Next chief check: {formatRelativeTime(task.nextCheckAt)}</div>
              )}
              {task.lastChiefCheckAt && (
                <div>Last chief check: {formatRelativeTime(task.lastChiefCheckAt)}</div>
              )}
              {task.lastAssigneeUpdateAt && (
                <div>
                  Last assignee update: {formatRelativeTime(task.lastAssigneeUpdateAt)}
                </div>
              )}
            </div>
          )}

          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                Acceptance Criteria
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {task.acceptanceCriteria.map((criterion: string, idx: number) => (
                  <li key={`${criterion}-${idx}`} className="text-xs text-gray-700">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Assignees */}
        {assignees.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {assignees.map((agent: Agent | undefined) =>
              agent ? (
                <div
                  key={agent._id}
                  className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full"
                >
                  <AgentAvatar emoji={agent.emoji} size="xs" />
                  <span>{agent.name}</span>
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              Attached Documents ({documents.length})
            </p>
            <div className="space-y-1">
              {documents.map((doc: Document) => (
                <div
                  key={doc._id}
                  className="flex items-center gap-2 text-xs text-blue-600 hover:underline cursor-pointer py-1"
                >
                  <span>📄</span>
                  <span>{doc.title}</span>
                  {doc.type === "runbook" && (
                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      runbook
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Archive */}
        {task.status !== "done" && (
          <button
            onClick={() => archiveTask({ id: taskId })}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded mb-5 hover:bg-gray-50"
          >
            🗂️ Archive Task
          </button>
        )}

        {/* Comments */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
            Comments ({messages.length})
          </p>

          <div className="space-y-3 mb-4">
            {messages.map((msg: Message) => {
              const agent = agents.find((a: Agent) => a._id === msg.fromAgentId);
              return (
                <div key={msg._id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">
                    {agent?.emoji ?? "👤"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-semibold text-gray-800">
                        {msg.fromName ?? agent?.name ?? "Unknown"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatRelativeTime(msg._creationTime)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                Review History ({reviews.length})
              </p>
              <div className="space-y-2">
                {reviews.map((review: TaskReview) => {
                  const reviewer = agents.find((a: Agent) => a._id === review.reviewerAgentId);
                  const pass = review.status === "pass";
                  return (
                    <div
                      key={review._id}
                      className={`border rounded p-2 ${pass ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40"}`}
                    >
                      <div className="flex items-center gap-2 text-[10px] mb-1">
                        <span className={pass ? "text-emerald-700" : "text-rose-700"}>
                          {pass ? "APPROVED" : "CHANGES REQUESTED"}
                        </span>
                        <span className="text-gray-500">
                          by {reviewer?.name ?? "Reviewer"} •{" "}
                          {formatRelativeTime(review.reviewedAt ?? review._creationTime)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700">{review.summary}</p>
                      {review.findings?.length > 0 && (
                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                          {review.findings.map((finding: string, idx: number) => (
                            <li key={`${review._id}-${idx}`} className="text-xs text-gray-600">
                              {finding}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Automation runs */}
          {automationRuns.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                Automation Audit ({automationRuns.length})
              </p>
              <div className="space-y-1.5">
                {automationRuns.map((run: any) => (
                  <div key={run._id} className="text-[11px] text-gray-600 border border-gray-100 rounded px-2 py-1.5">
                    <span className="font-medium text-gray-800">{run.agentName}</span>{" "}
                    <span className="text-gray-500">
                      {run.role} / {run.dispatchType}
                    </span>{" "}
                    <span
                      className={
                        run.status === "failed"
                          ? "text-rose-600"
                          : run.status === "succeeded"
                            ? "text-emerald-600"
                            : "text-amber-600"
                      }
                    >
                      {run.status}
                    </span>
                    {run.outputSummary && (
                      <span className="text-gray-500"> — {run.outputSummary}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comment input */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full text-xs px-3 py-2 resize-none focus:outline-none"
              rows={3}
              placeholder="Add a comment... (@ to mention, # to link doc)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleComment();
                }
              }}
            />
            <div className="flex justify-end px-3 py-2 bg-gray-50 border-t border-gray-100">
              <button
                onClick={handleComment}
                disabled={!newComment.trim()}
                className="text-xs bg-orange-500 text-white px-4 py-1.5 rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
