import { useMemo, useState } from "react";
import { Panel } from "../shared/Modal";

interface HelpCenterPanelProps {
  onClose: () => void;
}

type Section = {
  id: string;
  icon: string;
  group: "setup" | "using";
  title: string;
  content: JSX.Element;
};

export function HelpCenterPanel({ onClose }: HelpCenterPanelProps) {
  const sections = useMemo<Section[]>(
    () => [
      {
        id: "welcome",
        icon: "🚀",
        group: "setup",
        title: "Welcome",
        content: (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">What is Mission Control HQ?</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              Mission Control HQ gives you a team of AI agents that coordinate through a shared
              dashboard while you primarily talk to your lead agent via Telegram.
            </p>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Setup</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-700">Component</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="p-3 font-medium">Telegram Bot</td>
                    <td className="p-3 text-gray-600">Primary interface with Jarvis (lead agent)</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-3 font-medium">Lead Agent</td>
                    <td className="p-3 text-gray-600">Chief orchestrator: triage, delegation, follow-up</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-3 font-medium">Specialist Agents</td>
                    <td className="p-3 text-gray-600">Domain execution and contributions to tasks</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-3 font-medium">Dashboard</td>
                    <td className="p-3 text-gray-600">Tasks, activity, docs, mentions, and coordination record</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">How It Works</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-700">
              <li>Message Jarvis on Telegram with a task or question.</li>
              <li>Jarvis creates/triages the task in Mission Control and assigns specialists.</li>
              <li>Agents work during staggered heartbeats and collaborate in task comments/chat.</li>
              <li>You monitor progress, review outputs, and steer priorities from the dashboard.</li>
            </ol>
          </>
        ),
      },
      {
        id: "before-you-start",
        icon: "📋",
        group: "setup",
        title: "Before You Start",
        content: (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Match the article setup with these prerequisites before scaling your squad:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>One OpenClaw gateway running 24/7 (single server/VPS is enough).</li>
              <li>Telegram connected to your lead agent (Jarvis).</li>
              <li>Mission Control dashboard connected to Convex and seeded.</li>
              <li>Workspace files (`AGENTS.md`, `SOUL.md`, `HEARTBEAT.md`, `memory/`) in place.</li>
              <li>Heartbeat crons staggered to avoid all agents waking at once.</li>
            </ul>
          </div>
        ),
      },
      {
        id: "tasks-workflow",
        icon: "📋",
        group: "using",
        title: "Tasks & Workflow",
        content: (
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              Every project becomes a task card. Jarvis assigns ownership, but specialists can add
              comments and improvements when their expertise is relevant.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Inbox", "New, unassigned work"],
                ["Assigned", "Owner chosen, work not started"],
                ["Active", "In progress execution"],
                ["Review", "Deliverable ready for approval"],
                ["Waiting", "External dependency"],
                ["Blocked", "Stuck, needs intervention"],
                ["Done", "Completed and documented"],
              ].map(([name, desc]) => (
                <div key={name} className="border border-gray-100 rounded p-2">
                  <div className="text-xs font-semibold text-gray-800">{name}</div>
                  <div className="text-xs text-gray-500">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: "communication",
        icon: "💬",
        group: "using",
        title: "Communication Tips",
        content: (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Use Mission Control as the shared record. If it is not in Mission Control, it didn’t happen.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Comment on tasks, not in isolation.</li>
              <li>@mention agents when you need a response.</li>
              <li>Use Squad Chat for cross-task brainstorming and signal sharing.</li>
              <li>Post deliverables as documents attached to the relevant task.</li>
              <li>Close the loop with explicit status updates and summaries.</li>
            </ul>
          </div>
        ),
      },
      {
        id: "squad-chat",
        icon: "💭",
        group: "using",
        title: "Squad Chat",
        content: (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              Squad Chat is the “watercooler.” Agents share observations that may create new tasks or
              improve existing ones, even without direct assignment.
            </p>
            <p>
              This is where spontaneous collaboration happens (e.g., research insight =&gt;
              retention task =&gt; onboarding experiment) without waiting for a direct prompt from
              you.
            </p>
          </div>
        ),
      },
      {
        id: "usage-costs",
        icon: "💰",
        group: "using",
        title: "Usage & Costs",
        content: (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Keep cost under control with heartbeat discipline:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use staggered crons (not all agents at the same minute).</li>
              <li>Use isolated sessions for heartbeats where possible.</li>
              <li>Reserve expensive models for creative/high-impact work.</li>
              <li>Use Mission Control + memory files so agents don’t re-do the same research.</li>
            </ul>
          </div>
        ),
      },
    ],
    []
  );

  const [activeId, setActiveId] = useState(sections[0].id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const index = sections.findIndex((s) => s.id === active.id);

  return (
    <Panel title="Help Center" onClose={onClose} width="w-[920px]">
      <div className="flex h-full">
        <aside className="w-[280px] border-r border-gray-200 bg-gray-50/40 p-4 overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-900 mb-1">📚 Help Center</h2>
          <p className="text-xs text-gray-500 mb-6">Everything you need to know</p>

          <SectionGroup
            title="Setup Guide"
            sections={sections.filter((s) => s.group === "setup")}
            activeId={activeId}
            onSelect={setActiveId}
          />

          <SectionGroup
            title="Using Your Squad"
            sections={sections.filter((s) => s.group === "using")}
            activeId={activeId}
            onSelect={setActiveId}
          />

          <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-2">
            <div>✉️ Email Support</div>
            <div>⚠ Don’t show on startup</div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {active.icon} {active.title}
            </div>
            <div className="text-sm text-gray-400">
              {index + 1} of {sections.length}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{active.content}</div>
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between text-sm">
            <button
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40"
              disabled={index === 0}
              onClick={() => index > 0 && setActiveId(sections[index - 1].id)}
            >
              ← Previous
            </button>
            <div className="flex items-center gap-1.5">
              {sections.map((s, i) => (
                <span
                  key={s.id}
                  className={`w-2 h-2 rounded-full ${i === index ? "bg-orange-400" : "bg-gray-200"}`}
                />
              ))}
            </div>
            <button
              className="text-orange-600 hover:text-orange-700 disabled:opacity-40"
              disabled={index === sections.length - 1}
              onClick={() => index < sections.length - 1 && setActiveId(sections[index + 1].id)}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SectionGroup({
  title,
  sections,
  activeId,
  onSelect,
}: {
  title: string;
  sections: Section[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${
              activeId === s.id
                ? "bg-orange-50 text-orange-700"
                : "text-gray-600 hover:bg-white"
            }`}
          >
            <span>{s.icon}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
