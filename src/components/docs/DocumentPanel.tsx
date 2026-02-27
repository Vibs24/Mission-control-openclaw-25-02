import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Panel } from "../shared/Modal";
import { formatRelativeTime } from "../../lib/utils";
import type { Document } from "../../types";
import type { Id } from "../../../convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface DocumentPanelProps {
  onClose: () => void;
}

export function DocumentPanel({ onClose }: DocumentPanelProps) {
  const [selectedDocId, setSelectedDocId] = useState<Id<"documents"> | null>(null);

  const docs = (useQuery(api.documents.list, {}) ?? []) as Document[];
  const selectedDoc = useQuery(
    api.documents.get,
    selectedDocId ? { id: selectedDocId } : "skip"
  );
  const togglePin = useMutation(api.documents.togglePin);

  const pinned = docs.filter((d: Document) => d.isPinned);
  const standalone = docs.filter((d: Document) => !d.isPinned && d.type === "standalone");
  const deliverables = docs.filter((d: Document) => !d.isPinned && d.type !== "standalone");

  if (selectedDoc) {
    return (
      <Panel title="Documentation" onClose={onClose} width="w-[520px]">
        <div className="p-4">
          {/* Back */}
          <button
            onClick={() => setSelectedDocId(null)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-4"
          >
            ← Back to Docs
          </button>

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-1">
                {selectedDoc.title}
              </h2>
              <p className="text-[10px] text-gray-500">
                by {selectedDoc.createdByName ?? "System"} · Updated{" "}
                {formatRelativeTime(selectedDoc._creationTime)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled
                title="PDF export is not implemented yet"
                className="text-xs border border-gray-200 px-3 py-1 rounded text-gray-300 cursor-not-allowed"
              >
                📄 PDF
              </button>
              <button
                onClick={() => togglePin({ id: selectedDoc._id })}
                className={`text-xs border px-3 py-1 rounded hover:bg-gray-50 ${
                  selectedDoc.isPinned
                    ? "border-orange-300 text-orange-600"
                    : "border-gray-200"
                }`}
              >
                📌 {selectedDoc.isPinned ? "Pinned" : "Pin"}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedDoc.content}
            </ReactMarkdown>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Documentation" onClose={onClose} width="w-[360px]">
      <div className="p-4">
        <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
          📋 Documents
        </h2>

        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              📌 Pinned ({pinned.length})
            </p>
            {pinned.map((doc: Document) => (
              <DocRow key={doc._id} doc={doc} onClick={() => setSelectedDocId(doc._id)} />
            ))}
          </div>
        )}

        {/* Standalone */}
        {standalone.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              📝 Standalone ({standalone.length})
            </p>
            {standalone.map((doc: Document) => (
              <DocRow key={doc._id} doc={doc} onClick={() => setSelectedDocId(doc._id)} />
            ))}
          </div>
        )}

        {/* Deliverables */}
        {deliverables.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
              📦 Deliverables ({deliverables.length})
            </p>
            {deliverables.map((doc: Document) => (
              <DocRow key={doc._id} doc={doc} onClick={() => setSelectedDocId(doc._id)} />
            ))}
          </div>
        )}

        {docs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            No documents yet
          </p>
        )}
      </div>
    </Panel>
  );
}

function DocRow({
  doc,
  onClick,
}: {
  doc: Document;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-2 w-full text-left py-2 hover:bg-gray-50 rounded px-2 -mx-2 transition-colors"
    >
      <span className="text-xs mt-0.5">
        {doc.type === "runbook" ? "📕" : doc.type === "deliverable" ? "📦" : "📄"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{doc.title}</p>
        <p className="text-[10px] text-gray-400">
          {doc.createdByName ?? "System"} · {formatRelativeTime(doc._creationTime)}
        </p>
      </div>
    </button>
  );
}
