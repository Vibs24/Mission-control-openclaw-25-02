import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AgentCard } from "../agents/AgentCard";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Agent } from "../../types";

interface SidebarProps {
  selectedAgentId: Id<"agents"> | null;
  onSelectAgent: (id: Id<"agents"> | null) => void;
}

export function Sidebar({ selectedAgentId, onSelectAgent }: SidebarProps) {
  const agents = (useQuery(api.agents.list) ?? []) as Agent[];
  const activeCount = agents.filter((a: Agent) => a.status === "active").length;

  return (
    <aside className="w-[200px] flex-shrink-0 border-r border-gray-200 bg-cream-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
            Agents
          </span>
          <span className="ml-auto text-xs text-gray-500">{agents.length}</span>
        </div>
      </div>

      {/* All Agents Row */}
      <button
        onClick={() => onSelectAgent(null)}
        className={`flex items-center gap-2.5 px-4 py-2.5 w-full text-left hover:bg-gray-100 transition-colors border-b border-gray-100 ${
          selectedAgentId === null ? "bg-orange-50" : ""
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <span className="text-sm">🔮</span>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-800">All Agents</div>
          <div className="text-[10px] text-gray-500">{agents.length} total</div>
        </div>
        {activeCount > 0 && (
          <span className="ml-auto text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
            {activeCount} Active
          </span>
        )}
      </button>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto py-1">
        {agents.map((agent: Agent) => (
          <AgentCard
            key={agent._id}
            agent={agent}
            selected={selectedAgentId === agent._id}
            onClick={() => onSelectAgent(agent._id)}
          />
        ))}
      </div>
    </aside>
  );
}
