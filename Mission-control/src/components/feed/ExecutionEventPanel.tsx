import { useQuery } from "convex/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatRelativeTime } from "../../lib/utils";
import { Panel } from "../shared/Modal";
import type { ExecutionEvent, Task } from "../../types";

interface ExecutionEventPanelProps {
  eventId: Id<"executionEvents">;
  onClose: () => void;
  onTaskClick?: (taskId: Id<"tasks">) => void;
}

function severityClass(severity: string) {
  if (severity === "success") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (severity === "warning") return "bg-amber-50 text-amber-700 border-amber-200";
  if (severity === "error") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

export function ExecutionEventPanel({ eventId, onClose, onTaskClick }: ExecutionEventPanelProps) {
  const event = (useQuery((api as any).executionEvents.get, { id: eventId }) ?? null) as ExecutionEvent | null;
  const task = (useQuery(
    api.tasks.get,
    event?.taskId ? { id: event.taskId } : "skip"
  ) ?? null) as Task | null;

  if (!event) {
    return (
      <Panel title="Execution Event" onClose={onClose} width="w-[520px]">
        <div className="p-4 text-sm text-gray-500">Loading event details...</div>
      </Panel>
    );
  }

  return (
    <Panel title="Execution Event" onClose={onClose} width="w-[520px]">
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{event.title}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded border uppercase ${severityClass(event.severity)}`}>
              {event.severity}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 uppercase">
              {event.kind}
            </span>
          </div>
          <p className="text-xs text-gray-600">{event.summary}</p>
          <div className="mt-1 text-[10px] text-gray-400">
            {event.actorName} • {formatRelativeTime(event.createdAt || event._creationTime)}
          </div>
        </div>

        {task && (
          <div className="border border-gray-100 rounded p-3 bg-gray-50">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Task</div>
            <button
              className="text-xs font-medium text-orange-700 hover:underline"
              onClick={() => onTaskClick?.(task._id)}
            >
              #{String(task._id)} • {task.title}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {event.workDone && (
            <div className="border border-gray-100 rounded p-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Work Done</div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap">{event.workDone}</div>
            </div>
          )}
          {event.workingNow && (
            <div className="border border-gray-100 rounded p-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Working Now</div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap">{event.workingNow}</div>
            </div>
          )}
          {event.nextSteps && (
            <div className="border border-gray-100 rounded p-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Next Steps</div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap">{event.nextSteps}</div>
            </div>
          )}
          {event.blockers && (
            <div className="border border-rose-100 bg-rose-50/40 rounded p-2">
              <div className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Blockers</div>
              <div className="text-xs text-rose-700 whitespace-pre-wrap">{event.blockers}</div>
            </div>
          )}
        </div>

        {(event.evidencePaths?.length ?? 0) > 0 && (
          <div className="border border-gray-100 rounded p-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Evidence Paths</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {(event.evidencePaths ?? []).map((item, idx) => (
                <li key={`${item}-${idx}`} className="text-xs text-gray-700 break-all">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {event.detailsMarkdown && (
          <div className="border border-gray-100 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Expanded Context</div>
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.detailsMarkdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
