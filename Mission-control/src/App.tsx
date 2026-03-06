import { useState } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Topbar } from "./components/layout/Topbar";
import { Sidebar } from "./components/layout/Sidebar";
import { MissionQueue } from "./components/tasks/MissionQueue";
import { TaskDetailPanel } from "./components/tasks/TaskDetailPanel";
import { AgentProfilePanel } from "./components/agents/AgentProfilePanel";
import { LiveFeed } from "./components/feed/LiveFeed";
import { ExecutionEventPanel } from "./components/feed/ExecutionEventPanel";
import { SquadChat } from "./components/chat/SquadChat";
import { DocumentPanel } from "./components/docs/DocumentPanel";
import { MemoryPanel } from "./components/memory/MemoryPanel";
import { HelpCenterPanel } from "./components/help/HelpCenterPanel";
import type { Id } from "../convex/_generated/dataModel";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

type RightPanelType =
  | "taskDetail"
  | "executionEvent"
  | "agentProfile"
  | "docs"
  | "chat"
  | "memory"
  | "help"
  | null;

interface RightPanelState {
  type: RightPanelType;
  taskId?: Id<"tasks">;
  agentId?: Id<"agents">;
  eventId?: Id<"executionEvents">;
}

function AppInner() {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanelState>({ type: null });
  const [lastTaskContextId, setLastTaskContextId] = useState<Id<"tasks"> | undefined>(undefined);

  const openTask = (taskId: Id<"tasks">) => {
    setLastTaskContextId(taskId);
    setRightPanel({ type: "taskDetail", taskId });
  };

  const openExecutionEvent = (eventId: Id<"executionEvents">) => {
    setRightPanel({ type: "executionEvent", eventId });
  };

  const openAgent = (agentId: Id<"agents">) => {
    setSelectedAgentId(agentId);
    setRightPanel({ type: "agentProfile", agentId });
  };

  const closePanel = () => {
    setRightPanel({ type: null });
  };

  const handleSelectAgent = (agentId: Id<"agents"> | null) => {
    setSelectedAgentId(agentId);
    if (agentId) {
      setRightPanel({ type: "agentProfile", agentId });
    } else {
      if (rightPanel.type === "agentProfile") closePanel();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-cream-100 overflow-hidden font-sans">
      {/* Topbar */}
      <Topbar
        onChatOpen={() => setRightPanel({ type: "chat", taskId: lastTaskContextId })}
        onDocsOpen={() => setRightPanel({ type: "docs" })}
        onMemoryOpen={() => setRightPanel({ type: "memory" })}
        onHelpOpen={() => setRightPanel({ type: "help" })}
        activePanel={rightPanel.type}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
        />

        {/* Mission Queue */}
        <main className="flex-1 min-w-0 min-h-0 flex overflow-hidden">
          <MissionQueue
            filterAgentId={selectedAgentId}
            onTaskClick={openTask}
          />

          {/* Live Feed — always visible unless a right panel takes its place */}
          {rightPanel.type === null && (
            <LiveFeed onTaskClick={openTask} onExecutionEventClick={openExecutionEvent} />
          )}
        </main>

        {/* Right Panel */}
        {rightPanel.type === "taskDetail" && rightPanel.taskId && (
          <TaskDetailPanel taskId={rightPanel.taskId} onClose={closePanel} />
        )}
        {rightPanel.type === "executionEvent" && rightPanel.eventId && (
          <ExecutionEventPanel
            eventId={rightPanel.eventId}
            onClose={closePanel}
            onTaskClick={openTask}
          />
        )}
        {rightPanel.type === "agentProfile" && rightPanel.agentId && (
          <AgentProfilePanel
            agentId={rightPanel.agentId}
            onClose={closePanel}
            onTaskClick={openTask}
          />
        )}
        {rightPanel.type === "docs" && <DocumentPanel onClose={closePanel} />}
        {rightPanel.type === "chat" && (
          <SquadChat taskId={rightPanel.taskId ?? lastTaskContextId} onClose={closePanel} />
        )}
        {rightPanel.type === "memory" && <MemoryPanel onClose={closePanel} />}
        {rightPanel.type === "help" && <HelpCenterPanel onClose={closePanel} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConvexProvider client={convex}>
      <AppInner />
    </ConvexProvider>
  );
}
