import { Panel } from "../shared/Modal";

interface MemoryPanelProps {
  onClose: () => void;
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  return (
    <Panel title="Memory" onClose={onClose} width="w-[520px]">
      <div className="p-4 space-y-5">
        <section>
          <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            🧠 Memory System
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            Agents persist context through files in the workspace. This matches the article’s memory
            stack: session memory + working memory + daily notes + long-term memory.
          </p>
        </section>

        <section className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Recommended Files
          </div>
          <div className="p-3 space-y-2 text-xs">
            <MemoryRow path="workspace/memory/WORKING.md" purpose="Current task state; read first on every wakeup." />
            <MemoryRow path="workspace/memory/YYYY-MM-DD.md" purpose="Daily notes and raw logs of work completed." />
            <MemoryRow path="workspace/MEMORY.md" purpose="Curated long-term stable knowledge and decisions." />
            <MemoryRow path="workspace/HEARTBEAT.md" purpose="Wakeup checklist and heartbeat behavior." />
            <MemoryRow path="workspace/AGENTS.md" purpose="Operating manual (how all agents should behave)." />
          </div>
        </section>

        <section>
          <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
            Golden Rule
          </h3>
          <blockquote className="border-l-2 border-orange-300 pl-3 text-xs text-gray-700">
            If you want to remember something, write it to a file.
          </blockquote>
        </section>

        <section>
          <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
            Heartbeat Memory Flow
          </h3>
          <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600">
            <li>Read `memory/WORKING.md`</li>
            <li>Check assigned tasks and @mentions in Mission Control</li>
            <li>Resume active work or report `HEARTBEAT_OK`</li>
            <li>Update `WORKING.md` and daily notes before sleeping</li>
          </ol>
        </section>
      </div>
    </Panel>
  );
}

function MemoryRow({ path, purpose }: { path: string; purpose: string }) {
  return (
    <div className="flex gap-3 items-start">
      <code className="text-[11px] bg-gray-100 px-2 py-1 rounded text-gray-700 whitespace-nowrap">
        {path}
      </code>
      <p className="text-gray-500 leading-relaxed">{purpose}</p>
    </div>
  );
}
