export const WORKFLOW_EXECUTION_MAP = {
  general: ["Backend", "Frontend", "Database", "Designer", "Documentation", "Operations", "Reviewer"],
  review: ["Backend", "Operations", "Reviewer"],
  debug: ["Backend", "Designer", "Operations", "Reviewer"],
  incident: ["Operations", "Backend", "Database", "Documentation", "Reviewer"],
  architecture: ["Backend", "Database", "Frontend", "Documentation", "Reviewer"],
  standup: ["Operations", "Documentation", "Reviewer"],
  deploy_checklist: ["Operations", "Backend", "Reviewer"],
};

export const LEGACY_TO_PARALLEL_AGENT_ALIAS = {
  Dev: "Backend",
  Bruce: "Operations",
  Natasha: "Designer",
  Peter: "Documentation",
  Steve: "Operations",
  Reviewer: "Reviewer",
  Jarvis: "Chief",
};

export const PARALLEL_TO_LEGACY_AGENT_ALIAS = {
  Frontend: "Dev",
  Designer: "Natasha",
  Database: "Dev",
  Backend: "Dev",
  Documentation: "Peter",
  Operations: "Steve",
  Reviewer: "Reviewer",
  "Project Manager": "Jarvis",
  Chief: "Jarvis",
};

const AGENT_ROLE_PLAYBOOKS = {
  Chief: {
    summary: "Final orchestration authority. Owns triage, policy enforcement, escalation, and recovery.",
    responsibilities: [
      "Classify intake, select orchestration model, and enforce guardrails.",
      "Monitor node/step health and intervene on stalls.",
      "Never count chief notes as specialist proof.",
    ],
    workflowFocus: ["all"],
  },
  "Project Manager": {
    summary: "Dependency coordinator for PM graph execution.",
    responsibilities: [
      "Build and maintain dependency graph per task.",
      "Dispatch all runnable nodes in parallel.",
      "Unblock dependency_wait nodes immediately when dependencies complete.",
    ],
    workflowFocus: ["all"],
  },
  Frontend: {
    summary: "Frontend implementation specialist.",
    responsibilities: [
      "Implement UI flows and responsive behavior.",
      "Publish reproducible evidence inside task artifact folder.",
      "Emit structured worklog for every step.",
    ],
    workflowFocus: ["general", "architecture"],
  },
  Designer: {
    summary: "Visual/UX specialist.",
    responsibilities: [
      "Define layout intent and design checks for implementation.",
      "Document UX/design constraints and approvals.",
      "Handoff clear design decisions to dependent nodes.",
    ],
    workflowFocus: ["general", "debug", "architecture"],
  },
  Database: {
    summary: "Schema and persistence specialist.",
    responsibilities: [
      "Own schema design, migration readiness, and query safety.",
      "Attach explicit DB evidence paths for required outputs.",
      "Escalate data integrity/performance risks early.",
    ],
    workflowFocus: ["general", "debug", "incident", "architecture"],
  },
  Backend: {
    summary: "Service/API implementation specialist.",
    responsibilities: [
      "Implement backend logic and integration behavior.",
      "Provide runnable evidence with concrete output artifacts.",
      "Coordinate with Database/Frontend dependencies.",
    ],
    workflowFocus: ["all"],
  },
  Documentation: {
    summary: "Technical documentation specialist.",
    responsibilities: [
      "Produce runbooks, README, and operator guidance.",
      "Attach durable docs required for reviewer signoff.",
      "Capture final implementation context for handoff.",
    ],
    workflowFocus: ["general", "incident", "architecture", "standup", "deploy_checklist"],
  },
  Operations: {
    summary: "Reliability and deployment specialist.",
    responsibilities: [
      "Own operational safety, deploy checks, and mitigation strategy.",
      "Publish stability findings and recovery plans.",
      "Gate readiness before reviewer step.",
    ],
    workflowFocus: ["review", "debug", "incident", "standup", "deploy_checklist"],
  },
  Reviewer: {
    summary: "Independent QA gatekeeper.",
    responsibilities: [
      "Validate proof quality, acceptance criteria, and completion integrity.",
      "Reject insufficient evidence with concrete findings.",
      "Approve only when outputs are reproducible and verifiable.",
    ],
    workflowFocus: ["all"],
  },
};

export function getAgentRolePlaybook(agentName) {
  const name = String(agentName || "").trim();
  if (AGENT_ROLE_PLAYBOOKS[name]) return AGENT_ROLE_PLAYBOOKS[name];
  const mapped = LEGACY_TO_PARALLEL_AGENT_ALIAS[name];
  if (mapped && AGENT_ROLE_PLAYBOOKS[mapped]) return AGENT_ROLE_PLAYBOOKS[mapped];
  return AGENT_ROLE_PLAYBOOKS.Chief;
}

export function workflowChecklistForAgent(agentName) {
  const name = String(agentName || "").trim();
  const normalized = LEGACY_TO_PARALLEL_AGENT_ALIAS[name] || name;
  const lines = [];
  for (const [workflow, chain] of Object.entries(WORKFLOW_EXECUTION_MAP)) {
    if (chain.includes(normalized) || normalized === "Chief" || normalized === "Project Manager") {
      lines.push(`${workflow}: ${chain.join(" -> ")}`);
    }
  }
  return lines;
}
