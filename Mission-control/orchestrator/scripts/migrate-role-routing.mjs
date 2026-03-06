import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  LEGACY_TO_PARALLEL_AGENT_ALIAS,
  WORKFLOW_EXECUTION_MAP,
} from "../workflows/role-mapping.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
const logsDir = path.join(orchestratorDir, "logs");

const ACTIVE_TASK_STATUSES = new Set([
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "waiting",
  "blocked",
]);

const NON_TERMINAL_NODE_STATUSES = new Set([
  "queued",
  "dependency_wait",
  "runnable",
  "running",
  "waiting_handoff",
  "blocked",
  "failed",
]);

const CANONICAL_ROLE_NAME_BY_KEY = {
  chief: "Chief",
  project_manager: "Project Manager",
  frontend: "Frontend",
  designer: "Designer",
  database: "Database",
  backend: "Backend",
  documentation: "Documentation",
  operations: "Operations",
  reviewer: "Reviewer",
};

const SPECIALIST_ROLE_NAMES = new Set([
  "Frontend",
  "Designer",
  "Database",
  "Backend",
  "Documentation",
  "Operations",
]);

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

function normalize(value) {
  return String(value || "").trim();
}

function normalizeNodeKey(value = "") {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function guessSpecialistRoleFromNode(node, workflowKind = "general") {
  const directAgentName = normalize(node?.agentName);
  if (SPECIALIST_ROLE_NAMES.has(directAgentName)) return directAgentName;

  const mappedLegacy = LEGACY_TO_PARALLEL_AGENT_ALIAS[directAgentName];
  if (mappedLegacy && SPECIALIST_ROLE_NAMES.has(mappedLegacy)) return mappedLegacy;

  const key = normalizeNodeKey(node?.nodeKey || "");
  if (key.includes("frontend")) return "Frontend";
  if (key.includes("designer")) return "Designer";
  if (key.includes("database")) return "Database";
  if (key.includes("backend")) return "Backend";
  if (key.includes("documentation")) return "Documentation";
  if (key.includes("operations")) return "Operations";

  const chain = WORKFLOW_EXECUTION_MAP[String(workflowKind || "general")] || [];
  for (const name of chain) {
    if (SPECIALIST_ROLE_NAMES.has(name)) return name;
  }
  return "Backend";
}

function desiredCanonicalName(node, task) {
  const role = normalize(node?.role).toLowerCase();
  if (role === "chief") return "Chief";
  if (role === "project_manager") return "Project Manager";
  if (role === "reviewer") return "Reviewer";
  if (role === "specialist") {
    return guessSpecialistRoleFromNode(node, task?.workflowKind || "general");
  }
  return null;
}

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  const env = {
    ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
    ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
    ...process.env,
  };

  const strictRoleRouting = env.STRICT_ROLE_ROUTING !== "false";
  const convexUrl = env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Missing MISSION_CONTROL_CONVEX_URL or VITE_CONVEX_URL");
  }

  const convex = new ConvexHttpClient(convexUrl);
  if (env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN) {
    convex.setAdminAuth(env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN);
  }

  const report = {
    at: new Date().toISOString(),
    strictRoleRouting,
    ensured: null,
    retired: null,
    updatedTasks: [],
    remappedNodes: [],
    skippedTasks: [],
    violations: [],
  };

  report.ensured = await convex.mutation(api.agents.ensureRoleAgents, {});
  report.retired = await convex.mutation(api.agents.retireLegacyAgents, {});

  const agents = await convex.query(api.agents.list, { includeRetired: true });
  const byId = new Map((agents || []).map((agent) => [String(agent._id), agent]));
  const canonicalByName = new Map();
  for (const agent of agents || []) {
    if (agent.retired || agent.routable === false) continue;
    const roleKey = normalize(agent.roleKey);
    if (!CANONICAL_ROLE_NAME_BY_KEY[roleKey]) continue;
    canonicalByName.set(normalize(agent.name), agent);
  }

  for (const canonicalName of Object.values(CANONICAL_ROLE_NAME_BY_KEY)) {
    if (!canonicalByName.get(canonicalName)) {
      report.violations.push({
        type: "canonical_agent_missing",
        canonicalName,
      });
    }
  }

  const tasks = await convex.query(api.tasks.list, {});
  for (const task of tasks || []) {
    const status = normalize(task?.status);
    if (!ACTIVE_TASK_STATUSES.has(status)) continue;
    if (normalize(task?.orchestrationModel) !== "chief_pm_parallel") continue;

    const chief = canonicalByName.get("Chief");
    const projectManager = canonicalByName.get("Project Manager");
    if (!chief) {
      report.violations.push({
        type: "chief_missing",
        taskId: String(task._id),
      });
      continue;
    }
    if (!projectManager) {
      report.violations.push({
        type: "project_manager_missing",
        taskId: String(task._id),
      });
      continue;
    }

    if (
      String(task.projectManagerAgentId || "") !== String(projectManager._id) ||
      String(task.chiefAgentId || "") !== String(chief._id)
    ) {
      await convex.mutation(api.tasks.setOrchestrationModel, {
        id: task._id,
        orchestrationModel: "chief_pm_parallel",
        projectManagerAgentId: projectManager._id,
        chiefAgentId: chief._id,
        dependencySpec: task.dependencySpec,
        graphVersion: Number(task.graphVersion || 1),
        graphReadyAt: Number(task.graphReadyAt || Date.now()),
      });
      report.updatedTasks.push({
        taskId: String(task._id),
        action: "set_canonical_orchestration_owners",
        chiefAgentId: String(chief._id),
        projectManagerAgentId: String(projectManager._id),
      });
    }

    let nodes = [];
    try {
      nodes = await convex.query(api.executionGraph.listByTask, { taskId: task._id });
    } catch (error) {
      report.skippedTasks.push({
        taskId: String(task._id),
        reason: `execution_graph_unavailable:${String(error?.message || error)}`,
      });
      continue;
    }

    for (const node of nodes || []) {
      const nodeStatus = normalize(node?.status);
      if (!NON_TERMINAL_NODE_STATUSES.has(nodeStatus)) continue;

      const targetAgentName = desiredCanonicalName(node, task);
      if (!targetAgentName) continue;
      const targetAgent = canonicalByName.get(targetAgentName);
      if (!targetAgent) {
        report.violations.push({
          type: "target_agent_missing",
          taskId: String(task._id),
          nodeKey: normalize(node.nodeKey),
          targetAgentName,
        });
        continue;
      }

      const currentAgent = byId.get(String(node.agentId));
      const currentName = normalize(currentAgent?.name || node.agentName);
      const currentRetired = Boolean(currentAgent?.retired);
      const currentRoutable = currentAgent ? currentAgent.routable !== false : true;

      const needsReassign =
        String(node.agentId) !== String(targetAgent._id) ||
        currentRetired ||
        !currentRoutable ||
        currentName !== targetAgentName;

      if (!needsReassign) continue;

      await convex.mutation(api.executionGraph.reassignNodeAgent, {
        taskId: task._id,
        nodeKey: node.nodeKey,
        newAgentId: targetAgent._id,
        newAgentName: targetAgent.name,
        reason: "role_routing_migration: canonical role enforcement",
      });

      report.remappedNodes.push({
        taskId: String(task._id),
        nodeKey: normalize(node.nodeKey),
        fromAgentId: String(node.agentId),
        fromAgentName: normalize(node.agentName),
        toAgentId: String(targetAgent._id),
        toAgentName: targetAgent.name,
      });
    }

    const refreshedNodes = await convex.query(api.executionGraph.listByTask, { taskId: task._id });
    for (const node of refreshedNodes || []) {
      const nodeStatus = normalize(node?.status);
      if (!NON_TERMINAL_NODE_STATUSES.has(nodeStatus)) continue;
      const agent = byId.get(String(node.agentId));
      if (!agent) {
        report.violations.push({
          type: "node_agent_missing_in_db",
          taskId: String(task._id),
          nodeKey: normalize(node.nodeKey),
          agentId: String(node.agentId),
        });
        continue;
      }
      if (agent.retired || agent.routable === false) {
        report.violations.push({
          type: "active_node_on_retired_agent",
          taskId: String(task._id),
          nodeKey: normalize(node.nodeKey),
          agentName: normalize(agent.name),
          agentId: String(agent._id),
        });
      }
    }
  }

  const reportPath = path.join(logsDir, "role-routing-migration.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (strictRoleRouting && report.violations.length > 0) {
    throw new Error(
      `Role-routing violations detected (${report.violations.length}). See ${reportPath}`
    );
  }
}

main().catch((error) => {
  console.error("[migrate-role-routing] failed", error?.message || error);
  process.exitCode = 1;
});
