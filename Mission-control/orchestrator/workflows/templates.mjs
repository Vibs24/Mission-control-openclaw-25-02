import { getWorkflowDefinition, normalizeWorkflowKind } from "./registry.mjs";

export const WORKLOG_REQUIRED_FIELDS = [
  "Objective:",
  "Actions Taken:",
  "Findings:",
  "Evidence:",
  "Blockers:",
  "Next Handoff:",
];

const WORKFLOW_ACCEPTANCE = {
  general: [
    "Worklog follows structured schema (Objective, Actions, Findings, Evidence, Blockers, Next Handoff).",
    "Implementation progress is concrete and reproducible from task comments/docs.",
  ],
  review: [
    "Findings include security/performance/correctness and actionable recommendations.",
    "Review evidence references changed files or verifiable outputs.",
  ],
  debug: [
    "Reproduction, isolation, diagnosis, and fix/proposed fix are documented.",
    "Root cause and regression-prevention steps are explicit.",
  ],
  incident: [
    "Severity and impact are documented with a clear timeline.",
    "Mitigation actions and next communication cadence are documented.",
  ],
  architecture: [
    "Decision context, options, and tradeoff analysis are documented.",
    "Consequences and follow-up actions are listed.",
  ],
  standup: [
    "Summary includes yesterday, today, and blockers with concise actionable details.",
  ],
  deploy_checklist: [
    "Checklist covers pre-deploy, deploy, post-deploy, and rollback triggers.",
  ],
};

export function inferWorkflowAcceptanceCriteria(task, workflowKind) {
  const normalized = normalizeWorkflowKind(workflowKind);
  const base = WORKFLOW_ACCEPTANCE[normalized] || WORKFLOW_ACCEPTANCE.general;
  const criteria = [...base];
  criteria.push("Task status reflects actual progress and next action.");
  if (requiresOutputPathEvidence(task, normalized)) {
    criteria.push("Final specialist evidence includes verifiable files inside the auto-managed Artifact Folder.");
  }
  return [...new Set(criteria)];
}

export function requiresOutputPathEvidence(task, workflowKind) {
  const normalized = normalizeWorkflowKind(workflowKind);
  const text = `${task?.title || ""}\n${task?.description || ""}\n${task?.intakeText || ""}`.toLowerCase();
  if (/(output path|stored location|absolute path)/.test(text)) return true;
  if (normalized === "general") {
    return /(build|develop|code|coding|implement|python|javascript|typescript|html|css|sqlite|database|api|frontend|backend|website|dashboard|chatbot|app)/.test(
      text
    );
  }
  return /(build|develop|code|implement|script|feature|fix|api|website|dashboard|db|database)/.test(text);
}

function isSimpleTaskRequest(task) {
  const text = `${task?.title || ""}\n${task?.description || ""}\n${task?.intakeText || ""}`.toLowerCase();
  return /\b(simple|basic|minimal|starter|demo|small|quick)\b/.test(text);
}

export function buildSpecialistPrompt({
  task,
  specialist,
  workflowKind,
  stepIndex,
  totalSteps,
  nextSpecialist,
  deliverablesRoot,
  requiredOutputPath = null,
  memoryContext = "",
}) {
  const kind = normalizeWorkflowKind(workflowKind);
  const needsPath = requiresOutputPathEvidence(task, kind);
  const simpleTask = isSimpleTaskRequest(task);
  const workflow = getWorkflowDefinition(kind);
  return [
    `Mission Control task ${String(task._id)} assigned to ${specialist.name}.`,
    `Workflow: ${kind}`,
    `Role: ${specialist.role}`,
    `Task: ${task.title}`,
    "",
    "Description:",
    `${task.description}`,
    "",
    "Execution requirements:",
    "- Follow workflow-specific execution and provide concrete evidence.",
    "- Post exactly one structured worklog comment using this format:",
    `  ### Worklog — ${specialist.name} — Step ${stepIndex + 1}/${totalSteps}`,
    "  Objective:",
    "  Actions Taken:",
    "  Findings:",
    "  Evidence:",
    needsPath
      ? `  Artifact Folder: ${requiredOutputPath || `${deliverablesRoot}/<task-id>-<slug>`}`
      : "  Evidence: include verifiable details and references",
    needsPath
      ? "  Stored Location: optional (system auto-uses Artifact Folder when omitted)"
      : "  Stored Location: optional",
    "  Blockers:",
    `  Next Handoff: ${nextSpecialist ? nextSpecialist.name : "Reviewer"}`,
    "- Do not move task directly to done.",
    needsPath && requiredOutputPath
      ? `- Mandatory auto-managed Artifact Folder for this task: ${requiredOutputPath}`
      : "- Use the task-specified deliverable target path when present (auto-managed when provided).",
    needsPath
      ? `- Write deliverables directly inside the Artifact Folder under ${deliverablesRoot}/....`
      : "- Keep updates concise and verifiable.",
    needsPath
      ? "- Before completion, verify the Artifact Folder exists on disk and contains real deliverable files."
      : "- Keep updates concise and verifiable.",
    "- Do not call Mission Control HTTP endpoints from agent runtime (for example http://localhost:3000/api/...).",
    "- Evidence is filesystem-only: create files in the provided Artifact Folder and list those absolute paths.",
    needsPath
      ? "- In `Evidence:` list key files created in the Artifact Folder; manual Output Path text is optional metadata."
      : "- In `Evidence:` include only verifiable references.",
    needsPath
      ? "- If validation fails, create/fix artifacts in the same Artifact Folder and repost structured evidence."
      : "- Include blockers only when they are concrete and reproducible.",
    needsPath
      ? "- Never use placeholder paths (for example `/absolute/path`) in final evidence."
      : "- Keep evidence concrete and reproducible.",
    "",
    "Quality bar (mandatory):",
    "- Do a self-review before finalizing: find obvious bugs, edge cases, and broken flows, then fix them.",
    "- Validate your own output (tests/manual checks), and include the validation evidence in the worklog.",
    "- Prefer production-quality implementation over minimum viable output.",
    simpleTask
      ? "- Enhancement mode enabled for this task: upgrade the baseline request with improved UX, stronger structure, docs, and robustness."
      : "- If any issue is found during implementation, fix and rerun before handoff.",
    "",
    "Workflow review rubric:",
    `- ${workflow.reviewRubric}`,
    ...(memoryContext ? [String(memoryContext).trim()] : []),
  ].join("\n");
}

export function buildReviewerPrompt({ task, workflowKind, acceptanceCriteria, memoryContext = "" }) {
  const kind = normalizeWorkflowKind(workflowKind);
  const criteria = (acceptanceCriteria || []).filter(
    (line) => !/task status reflects actual progress and next action/i.test(String(line || ""))
  );
  return [
    `Review Mission Control task ${String(task._id)} (${task.title}).`,
    `Workflow: ${kind}`,
    "",
    "Acceptance criteria:",
    ...(criteria.length > 0 ? criteria : ["- No reviewer-specific criteria provided."]),
    "",
    "Decision rules:",
    "- Ensure specialist worklogs are structured and evidence-backed.",
    "- Ensure required Artifact Folder evidence exists when applicable (manual Output Path text is optional).",
    "- If all verifiable artifact/proof gates pass, do not FAIL solely because live Mission Control status alignment cannot be independently verified from your runtime context.",
    "- Treat live Mission Control status-alignment checks as orchestration-level (Chief/PM) signals, not reviewer fail criteria.",
    "- Return pass only when all criteria are verifiably satisfied.",
    ...(memoryContext ? ["", String(memoryContext).trim()] : []),
  ].join("\n");
}

export function isStructuredWorklog(text, { requirePath = false } = {}) {
  const body = String(text || "");
  if (!/^\s*###\s*Worklog\s*—/im.test(body)) return false;
  for (const field of WORKLOG_REQUIRED_FIELDS) {
    if (!new RegExp(`^\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "im").test(body)) {
      return false;
    }
  }
  if (!requirePath) return true;
  if (/(?:output path|stored location|artifact folder)\s*:\s*\/\S+/i.test(body)) return true;
  if (/^\s*[-*]\s*\/\S+/im.test(body)) return true;
  return false;
}

export function buildRelayWorklog({
  specialistName,
  stepIndex,
  totalSteps,
  summaryLines = [],
  outputPaths = [],
  nextHandoff = "Reviewer",
  runFailed = false,
  failCode = "",
}) {
  const evidenceLines = outputPaths.map((p) => `- Stored Location: ${p}`);
  if (evidenceLines.length === 0) evidenceLines.push("- No explicit output path captured yet.");

  return [
    `### Worklog — ${specialistName} — Step ${stepIndex + 1}/${Math.max(totalSteps, stepIndex + 1)}`,
    `Objective: ${runFailed ? "Report execution failure and preserve diagnostics." : "Complete assigned workflow turn with verifiable evidence."}`,
    `Actions Taken:\n- ${runFailed ? "Dispatch attempt executed and failed." : "Dispatch run executed and output captured."}`,
    `Findings:\n- ${summaryLines.length > 0 ? summaryLines.join("\n- ") : "No structured findings were captured from run output."}`,
    `Evidence:\n${evidenceLines.join("\n")}`,
    runFailed && failCode ? `Blockers:\n- Dispatch failed with code ${failCode}.` : "Blockers:\n- none",
    `Next Handoff: ${nextHandoff}`,
  ].join("\n\n");
}
