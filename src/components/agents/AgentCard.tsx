import { cn, getAgentStatusStyle, getOpenClawAgentId } from "../../lib/utils";
import type { Agent } from "../../types";

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function AgentCard({ agent, selected, onClick, compact }: AgentCardProps) {
  const statusStyle = getAgentStatusStyle(agent.status);
  const openclawAgentId = getOpenClawAgentId(agent.sessionKey);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 w-full text-left hover:bg-gray-100 transition-colors",
        selected && "bg-orange-50",
        compact && "py-1.5"
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className={cn(
            "rounded-full bg-gray-100 flex items-center justify-center",
            compact ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm"
          )}
        >
          {agent.emoji}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white",
            statusStyle.dot
          )}
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className={cn("font-semibold text-gray-800 truncate", compact ? "text-[11px]" : "text-xs")}>
            {agent.name}
          </span>
        </div>
        {!compact && (
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 truncate">{agent.role}</div>
            {openclawAgentId && (
              <div className="text-[9px] text-gray-400 truncate">
                OpenClaw: <code>{openclawAgentId}</code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status badge (only on active) */}
      {!compact && agent.status === "active" && (
        <span className="text-[9px] font-bold text-green-600 uppercase tracking-wide flex-shrink-0">
          ● WORKING
        </span>
      )}
    </button>
  );
}

export function AgentAvatar({
  emoji,
  size = "sm",
}: {
  emoji: string;
  size?: "xs" | "sm" | "md";
}) {
  const sizeClass = {
    xs: "w-5 h-5 text-[10px]",
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
  }[size];

  return (
    <div
      className={cn(
        "rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0",
        sizeClass
      )}
    >
      {emoji}
    </div>
  );
}
