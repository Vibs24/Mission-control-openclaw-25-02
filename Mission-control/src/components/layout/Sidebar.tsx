import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AgentCard } from "../agents/AgentCard";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Agent, AgentProofCompliance, AgentWorkloadSnapshot } from "../../types";

interface SidebarProps {
  selectedAgentId: Id<"agents"> | null;
  onSelectAgent: (id: Id<"agents"> | null) => void;
}

export function Sidebar({ selectedAgentId, onSelectAgent }: SidebarProps) {
  const [showRetired, setShowRetired] = useState(false);
  const agents = (useQuery(api.agents.list, { includeRetired: true }) ?? []) as Agent[];
  const routableAgents = agents.filter((agent) => agent.retired !== true && agent.routable !== false);
  const retiredAgents = agents.filter((agent) => agent.retired === true || agent.routable === false);
  const workloadRows =
    (useQuery((api as any).accountability.agentWorkloadSnapshot, {}) ?? []) as AgentWorkloadSnapshot[];
  const proofRows =
    (useQuery((api as any).accountability.proofComplianceByAgent, { windowHours: 24 }) ?? []) as AgentProofCompliance[];
  const workloadByAgent = new Map(workloadRows.map((row) => [String(row.agentId), row]));
  const proofByAgent = new Map(proofRows.map((row) => [String(row.agentId), row]));
  const activeCount = routableAgents.filter((a: Agent) => a.status === "active").length;
  const stuckTotal = workloadRows.reduce((sum, row) => sum + Number(row.stuckCount24h ?? 0), 0);

  return (
    <aside className="w-[200px] flex-shrink-0 border-r border-gray-200 bg-cream-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
            Agents
          </span>
          <span className="ml-auto text-xs text-gray-500">{routableAgents.length}</span>
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
          <div className="text-[10px] text-gray-500">{routableAgents.length} routable</div>
        </div>
        {activeCount > 0 && (
          <span className="ml-auto text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
            {activeCount} Active
          </span>
        )}
        {stuckTotal > 0 && (
          <span className="ml-1 text-[9px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
            {stuckTotal} Stuck
          </span>
        )}
      </button>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto py-1">
        <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Active Roster
        </div>
        {routableAgents.map((agent: Agent) => (
          <AgentCard
            key={agent._id}
            agent={agent}
            workload={workloadByAgent.get(String(agent._id))}
            proofComplianceRate={proofByAgent.get(String(agent._id))?.complianceRate}
            selected={selectedAgentId === agent._id}
            onClick={() => onSelectAgent(agent._id)}
          />
        ))}
        <div className="px-3 pt-2">
          <button
            onClick={() => setShowRetired((prev) => !prev)}
            className="w-full text-left text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-1 py-1 hover:text-gray-700"
          >
            {showRetired ? "▼" : "▶"} Retired Agents ({retiredAgents.length})
          </button>
        </div>
        {showRetired &&
          retiredAgents.map((agent: Agent) => (
            <AgentCard
              key={agent._id}
              agent={agent}
              workload={workloadByAgent.get(String(agent._id))}
              proofComplianceRate={proofByAgent.get(String(agent._id))?.complianceRate}
              selected={selectedAgentId === agent._id}
              onClick={() => onSelectAgent(agent._id)}
            />
          ))}
      </div>
    </aside>
  );
}
