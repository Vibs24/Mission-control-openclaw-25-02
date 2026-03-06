export const WORKFLOW_KINDS = [
  "general",
  "review",
  "debug",
  "incident",
  "architecture",
  "standup",
  "deploy_checklist",
];

const DEFAULT_FIELDS = [
  "Objective",
  "Actions Taken",
  "Findings",
  "Evidence",
  "Blockers",
  "Next Handoff",
];

export const WORKFLOW_REGISTRY = {
  general: {
    kind: "general",
    commands: ["/task"],
    defaultPriority: "normal",
    reviewRubric: "Validate correctness, evidence quality, and acceptance criteria coverage.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  review: {
    kind: "review",
    commands: ["/review"],
    defaultPriority: "normal",
    reviewRubric: "Validate security/performance/correctness findings and actionable recommendations.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Operations", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  debug: {
    kind: "debug",
    commands: ["/debug"],
    defaultPriority: "high",
    reviewRubric: "Validate reproducibility, root cause clarity, mitigation quality, and prevention steps.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Designer", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Operations", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  incident: {
    kind: "incident",
    commands: ["/incident"],
    defaultPriority: "urgent",
    reviewRubric: "Validate severity triage, mitigation timeline, communications, and postmortem actions.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Operations", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Database", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Documentation", role: "specialist", requiredProof: "document" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  architecture: {
    kind: "architecture",
    commands: ["/architecture"],
    defaultPriority: "normal",
    reviewRubric: "Validate tradeoff analysis, ADR quality, and implementation readiness.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Database", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Documentation", role: "specialist", requiredProof: "document" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  standup: {
    kind: "standup",
    commands: ["/standup"],
    defaultPriority: "normal",
    reviewRubric: "Validate timeline accuracy, blockers, and actionability of daily update.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Operations", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Documentation", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
  deploy_checklist: {
    kind: "deploy_checklist",
    commands: ["/deploy-checklist"],
    defaultPriority: "high",
    reviewRubric: "Validate pre-deploy checks, rollback readiness, and post-deploy verification criteria.",
    requiredWorklogFields: DEFAULT_FIELDS,
    steps: [
      { agentName: "Operations", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Backend", role: "specialist", requiredProof: "comment_summary" },
      { agentName: "Reviewer", role: "reviewer", requiredProof: "comment_summary" },
    ],
  },
};

const COMMAND_TO_KIND = new Map(
  Object.values(WORKFLOW_REGISTRY)
    .flatMap((workflow) => (workflow.commands || []).map((command) => [command, workflow.kind]))
);

export function normalizeWorkflowKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return WORKFLOW_KINDS.includes(value) ? value : "general";
}

export function workflowKindFromCommand(command) {
  const normalized = String(command || "").trim().toLowerCase();
  if (!normalized) return null;
  return COMMAND_TO_KIND.get(normalized) || null;
}

export function classifyWorkflowKindFromText(text) {
  const t = String(text || "").toLowerCase();
  if (/(incident|sev1|sev2|outage|production down|service down|pagerduty)/.test(t)) return "incident";
  if (/(review|pull request|pr |diff|security review|code quality)/.test(t)) return "review";
  if (/(debug|error|bug|traceback|stack trace|500|failing|broken)/.test(t)) return "debug";
  if (/(architecture|adr|system design|trade-?off|scalability|service boundary)/.test(t))
    return "architecture";
  if (/(standup|yesterday|today|blockers|daily update)/.test(t)) return "standup";
  if (/(deploy|release|rollback|checklist|pre-?deploy|post-?deploy)/.test(t))
    return "deploy_checklist";
  return "general";
}

export function resolveWorkflowKind({ command, text, existingKind } = {}) {
  if (existingKind) return normalizeWorkflowKind(existingKind);
  const commandKind = workflowKindFromCommand(command);
  if (commandKind) return commandKind;
  return classifyWorkflowKindFromText(text);
}

export function getWorkflowDefinition(kind) {
  const normalized = normalizeWorkflowKind(kind);
  return WORKFLOW_REGISTRY[normalized] || WORKFLOW_REGISTRY.general;
}

export function workflowLabel(kind) {
  return `workflow-${normalizeWorkflowKind(kind).replace(/_/g, "-")}`;
}
