import { normalizeWorkflowKind } from "./registry.mjs";

export const PARALLEL_SPECIALISTS = [
  "Frontend",
  "Designer",
  "Database",
  "Backend",
  "Documentation",
  "Operations",
];

const ROLE_KEYWORDS = {
  Frontend: /(frontend|ui|ux|dashboard|page|html|css|react|vite|client)/i,
  Designer: /(design|ui|ux|theme|layout|wireframe|visual)/i,
  Database: /(database|sqlite|sql|schema|migration|query|persistence|db)/i,
  Backend: /(backend|api|server|flask|fastapi|node|service|auth|logic)/i,
  Documentation: /(documentation|docs|readme|runbook|guide|operator|manual)/i,
  Operations: /(ops|operations|deploy|release|incident|recovery|rollback|stability|monitor)/i,
};

const BASE_DEPENDENCIES = {
  Frontend: ["Designer", "Backend"],
  Designer: [],
  Database: [],
  Backend: ["Database"],
  Documentation: ["Frontend", "Backend", "Database", "Operations"],
  Operations: ["Backend", "Database"],
  Reviewer: ["Frontend", "Designer", "Database", "Backend", "Documentation", "Operations"],
};

const REQUIRED_PROOF_BY_AGENT = {
  Frontend: "output_path",
  Designer: "comment_summary",
  Database: "output_path",
  Backend: "output_path",
  Documentation: "document",
  Operations: "comment_summary",
  Reviewer: "comment_summary",
};

const WORKFLOW_BASE_ROLES = {
  general: ["Backend", "Frontend", "Database", "Designer", "Documentation", "Operations"],
  review: ["Backend", "Operations", "Documentation"],
  debug: ["Backend", "Database", "Operations", "Documentation"],
  incident: ["Operations", "Backend", "Database", "Documentation"],
  architecture: ["Backend", "Database", "Frontend", "Documentation", "Operations"],
  standup: ["Operations", "Documentation"],
  deploy_checklist: ["Operations", "Backend", "Documentation"],
};

function normalizeRoleName(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  for (const candidate of [...PARALLEL_SPECIALISTS, "Reviewer"]) {
    if (candidate.toLowerCase() === key) return candidate;
  }
  return "";
}

function buildNodeKey(name = "") {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDependencyOverrideBlock(text = "") {
  const body = String(text || "");
  const match =
    body.match(/```mc-deps\s*([\s\S]*?)```/i) ||
    body.match(/```mc-dependencies\s*([\s\S]*?)```/i);
  if (!match?.[1]) return { map: null, raw: "", unknownAgents: [] };

  const raw = String(match[1] || "").trim();
  const map = {};
  const unknownAgents = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = line.match(/^([A-Za-z _-]+)\s*:\s*\[(.*?)\]\s*$/);
    if (!parsed) continue;
    const role = normalizeRoleName(parsed[1]);
    if (!role) {
      unknownAgents.push(String(parsed[1] || "").trim());
      continue;
    }
    const deps = [];
    for (const depRaw of String(parsed[2] || "").split(",")) {
      const depName = String(depRaw || "").trim();
      if (!depName) continue;
      const dep = normalizeRoleName(depName);
      if (!dep) {
        unknownAgents.push(depName);
        continue;
      }
      deps.push(dep);
    }
    map[role] = [...new Set(deps)];
  }
  return {
    map: Object.keys(map).length > 0 ? map : null,
    raw,
    unknownAgents: [...new Set(unknownAgents)],
  };
}

function ensureNoCycle(nodes) {
  const byRole = new Map(nodes.map((node) => [node.agentName, node]));
  const visiting = new Set();
  const visited = new Set();

  function dfs(role) {
    if (visited.has(role)) return;
    if (visiting.has(role)) {
      throw new Error(`dependency_cycle_detected:${role}`);
    }
    visiting.add(role);
    const node = byRole.get(role);
    const deps = node?.dependsOn || [];
    for (const dep of deps) {
      if (!byRole.has(dep)) {
        throw new Error(`dependency_unknown_agent:${dep}`);
      }
      dfs(dep);
    }
    visiting.delete(role);
    visited.add(role);
  }

  for (const role of byRole.keys()) dfs(role);
}

function inferSpecialistsByText(text = "", workflowKind = "general") {
  const selected = new Set(WORKFLOW_BASE_ROLES[workflowKind] || WORKFLOW_BASE_ROLES.general);
  for (const role of PARALLEL_SPECIALISTS) {
    if (ROLE_KEYWORDS[role]?.test(text)) {
      selected.add(role);
    }
  }
  // Keep at least one implementation track.
  if (![...selected].some((name) => name === "Backend" || name === "Frontend")) {
    selected.add("Backend");
  }
  if (![...selected].some((name) => name === "Database")) {
    selected.add("Database");
  }
  return [...selected];
}

function resolveAgentOrThrow(name, agentsByName, legacyAliasMap, allowAliasFallback) {
  const primary = agentsByName.get(name);
  if (primary) return { agent: primary, resolvedName: name, viaAlias: false };
  if (!allowAliasFallback) {
    throw new Error(`missing_agent:${name}`);
  }
  const alias = legacyAliasMap[name];
  if (alias && agentsByName.get(alias)) {
    return { agent: agentsByName.get(alias), resolvedName: alias, viaAlias: true };
  }
  throw new Error(`missing_agent:${name}`);
}

export function buildParallelExecutionPlan({
  task,
  workflowKind,
  agentsByName,
  legacyAliasMap = {},
  strictRoleRouting = true,
}) {
  const kind = normalizeWorkflowKind(workflowKind || "general");
  const context = `${task?.title || ""}\n${task?.description || ""}\n${task?.intakeText || ""}`;
  const inferredRoles = inferSpecialistsByText(context, kind);
  const override = parseDependencyOverrideBlock(context);
  if ((override.unknownAgents?.length ?? 0) > 0) {
    throw new Error(`dependency_override_unknown_agent:${override.unknownAgents.join(",")}`);
  }

  const nodes = [];
  const selectedRoles = [...new Set(inferredRoles)].filter((role) => PARALLEL_SPECIALISTS.includes(role));

  for (const role of selectedRoles) {
    const { agent, resolvedName, viaAlias } = resolveAgentOrThrow(
      role,
      agentsByName,
      legacyAliasMap,
      !strictRoleRouting
    );
    const deps = override.map?.[role] ?? BASE_DEPENDENCIES[role] ?? [];
    nodes.push({
      nodeKey: buildNodeKey(role),
      role: "specialist",
      agentName: role,
      runtimeAgentName: resolvedName,
      viaAlias,
      agentId: agent._id,
      dependsOn: deps.filter((dep) => selectedRoles.includes(dep)),
      requiredProof: REQUIRED_PROOF_BY_AGENT[role] || "comment_summary",
    });
  }

  const { agent: reviewerAgent, resolvedName: reviewerResolvedName, viaAlias: reviewerViaAlias } =
    resolveAgentOrThrow("Reviewer", agentsByName, legacyAliasMap, !strictRoleRouting);
  nodes.push({
    nodeKey: "reviewer",
    role: "reviewer",
    agentName: "Reviewer",
    runtimeAgentName: reviewerResolvedName,
    viaAlias: reviewerViaAlias,
    agentId: reviewerAgent._id,
    dependsOn: selectedRoles,
    requiredProof: "comment_summary",
  });

  ensureNoCycle(nodes);

  const normalizedNodes = nodes.map((node) => ({
    nodeKey: node.nodeKey,
    role: node.role,
    agentName: node.agentName,
    runtimeAgentName: node.runtimeAgentName,
    viaAlias: node.viaAlias,
    agentId: node.agentId,
    dependsOnNodeKeys: node.dependsOn.map((dep) => buildNodeKey(dep)),
    requiredProof: node.requiredProof,
    status: node.dependsOn.length > 0 ? "dependency_wait" : "runnable",
  }));

  return {
    workflowKind: kind,
    dependencySpec: override.raw || "",
    usedOverride: Boolean(override.map),
    selectedSpecialists: selectedRoles,
    nodes: normalizedNodes,
  };
}
