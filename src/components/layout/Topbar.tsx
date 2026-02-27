import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Agent, Task } from "../../types";

interface TopbarProps {
  onChatOpen: () => void;
  onDocsOpen: () => void;
  onMemoryOpen: () => void;
  onHelpOpen: () => void;
  activePanel: string | null;
}

export function Topbar({
  onChatOpen,
  onDocsOpen,
  onMemoryOpen,
  onHelpOpen,
  activePanel,
}: TopbarProps) {
  const [time, setTime] = useState(new Date());
  const agents = (useQuery(api.agents.list) ?? []) as Agent[];
  const tasks = (useQuery(api.tasks.list, {}) ?? []) as Task[];

  const activeAgents = agents.filter(
    (a: Agent) => a.status === "active"
  ).length;
  const queuedTasks = tasks.filter(
    (t: Task) => t.status !== "done"
  ).length;

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date
      .toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
      .toUpperCase();
  };

  return (
    <header className="flex items-center h-12 px-4 bg-cream-100 border-b border-gray-200 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-8">
        <span className="text-base">🚀</span>
        <span className="text-xs font-bold text-gray-800 tracking-wider uppercase">
          Mission Control HQ
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 mr-auto">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900 leading-none font-mono">
            {activeAgents}
          </div>
          <div className="text-[9px] text-gray-500 tracking-wider uppercase mt-0.5">
            Agents Active
          </div>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900 leading-none font-mono">
            {queuedTasks}
          </div>
          <div className="text-[9px] text-gray-500 tracking-wider uppercase mt-0.5">
            Tasks in Queue
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1 mr-6">
        <NavBtn
          icon="💬"
          label="Chat"
          active={activePanel === "chat"}
          onClick={onChatOpen}
        />
        <NavBtn
          icon="📋"
          label="Docs"
          active={activePanel === "docs"}
          onClick={onDocsOpen}
        />
        <NavBtn
          icon="🧠"
          label="Memory"
          active={activePanel === "memory"}
          onClick={onMemoryOpen}
        />
        <NavBtn
          icon="?"
          label="Help"
          active={activePanel === "help"}
          onClick={onHelpOpen}
        />
        <NavBtn icon="⏸" label="Pause" active={false} onClick={() => {}} disabled />
      </nav>

      {/* Clock */}
      <div className="text-right mr-4">
        <div className="text-sm font-mono font-bold text-gray-800">
          {formatTime(time)}
        </div>
        <div className="text-[9px] text-gray-500 tracking-wider">
          {formatDate(time)}
        </div>
      </div>

      {/* User */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">
          S
        </div>
        <span className="text-xs text-gray-700 font-medium">Sypha ▾</span>
      </div>
    </header>
  );
}

function NavBtn({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        disabled
          ? "text-gray-300 cursor-not-allowed"
          : active
            ? "bg-gray-200 text-gray-800"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-800"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
