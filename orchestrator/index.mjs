import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const deliverablesRoot = path.join(workspaceRoot, "deliverables");

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

function parseList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const localEnv = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(__dirname, ".env")),
};

const env = {
  ...localEnv,
  ...process.env,
};

const config = {
  convexUrl: env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL,
  convexAdminToken: env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN || "",
  telegramBotToken: env.TELEGRAM_BOT_TOKEN || "",
  telegramAllowedChatIds: new Set(parseList(env.TELEGRAM_ALLOWED_CHAT_IDS)),
  telegramAllowedUserIds: new Set(parseList(env.TELEGRAM_ALLOWED_USER_IDS)),
  telegramIntakeChatId: env.TELEGRAM_INTAKE_CHAT_ID || "",
  telegramWebhookPort: Number(env.TELEGRAM_WEBHOOK_PORT || 8787),
  telegramWebhookPath: env.TELEGRAM_WEBHOOK_PATH || "/telegram/webhook",
  telegramWebhookEnabled: env.TELEGRAM_WEBHOOK_ENABLED !== "false",
  telegramPollingEnabled: env.TELEGRAM_POLLING_ENABLED !== "false",
  telegramPollIntervalMs: Number(env.TELEGRAM_POLL_INTERVAL_SEC || 8) * 1000,
  chiefMonitorIntervalMs: Number(env.CHIEF_MONITOR_INTERVAL_SEC || 180) * 1000,
  chiefAgentName: env.CHIEF_AGENT_NAME || "Jarvis",
  reviewerAgentName: env.REVIEWER_AGENT_NAME || "Reviewer",
  openclawBin: env.OPENCLAW_BIN || "openclaw",
  openclawProfile: env.OPENCLAW_PROFILE || "",
  autoTriageEnabled: env.AUTO_TRIAGE_ENABLED !== "false",
  autoDispatchEnabled: env.AUTO_DISPATCH_ENABLED !== "false",
  autoReviewEnabled: env.AUTO_REVIEW_ENABLED !== "false",
  autoSubmitReadyTasksToReview: env.AUTO_SUBMIT_READY_TASKS_TO_REVIEW !== "false",
  autoBlockStaleExecutionEnabled: env.AUTO_BLOCK_STALE_EXECUTION !== "false",
  autoRedispatchStaleExecutionEnabled: env.AUTO_REDISPATCH_STALE_EXECUTION !== "false",
  allowAgentFallbackToMain: env.ALLOW_AGENT_FALLBACK_TO_MAIN === "true",
  accountabilityLedgerEnabled: env.ACCOUNTABILITY_LEDGER_ENABLED !== "false",
  accountabilityStrictGate: env.ACCOUNTABILITY_STRICT_GATE !== "false",
  accountabilityStepStaleMinutes: Math.max(1, Number(env.ACCOUNTABILITY_STEP_STALE_MINUTES || 10)),
  taskStaleDefaultMinutes: Number(env.TASK_STALE_DEFAULT_MINUTES || 30),
  maxChiefFollowupsBeforeBlocking: Math.max(1, Number(env.MAX_CHIEF_FOLLOWUPS_BEFORE_BLOCKING || 3)),
  reviewerDefaultDecision: env.REVIEWER_DEFAULT_DECISION || "heuristic",
  stateDir: path.join(__dirname, ".state"),
};

if (!config.convexUrl) {
  throw new Error("Missing MISSION_CONTROL_CONVEX_URL or VITE_CONVEX_URL");
}

fs.mkdirSync(config.stateDir, { recursive: true });
fs.mkdirSync(deliverablesRoot, { recursive: true });
const offsetFile = path.join(config.stateDir, "telegram-offset.json");
const runtimeStateFile = path.join(config.stateDir, "runtime-state.json");

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, filePath);
}

let runtimeState = {
  version: 1,
  process: {},
  telegram: {},
  loops: {},
  lastError: null,
};

function loadRuntimeState() {
  const loaded = readJsonFile(runtimeStateFile, null);
  if (loaded && typeof loaded === "object") {
    runtimeState = {
      version: 1,
      process: loaded.process || {},
      telegram: loaded.telegram || {},
      loops: loaded.loops || {},
      lastError: loaded.lastError || null,
    };
  }
  return runtimeState;
}

function persistRuntimeState() {
  writeJsonAtomic(runtimeStateFile, runtimeState);
}

function patchRuntimeState(patch) {
  runtimeState = {
    ...runtimeState,
    ...patch,
    process: { ...(runtimeState.process || {}), ...(patch.process || {}) },
    telegram: { ...(runtimeState.telegram || {}), ...(patch.telegram || {}) },
    loops: { ...(runtimeState.loops || {}), ...(patch.loops || {}) },
  };
  persistRuntimeState();
}

function markLoopHeartbeat(loopName, extra = {}) {
  patchRuntimeState({
    loops: {
      [loopName]: {
        at: Date.now(),
        ...extra,
      },
    },
  });
}

function recordRuntimeError(scope, error) {
  patchRuntimeState({
    lastError: {
      scope,
      at: Date.now(),
      message: String(error?.message || error || "Unknown error").slice(0, 1000),
    },
  });
}

function loadOffset() {
  try {
    return JSON.parse(fs.readFileSync(offsetFile, "utf8")).lastUpdateId ?? 0;
  } catch {
    return 0;
  }
}

function saveOffset(lastUpdateId) {
  fs.writeFileSync(
    offsetFile,
    JSON.stringify({ version: 1, lastUpdateId, savedAt: Date.now() }, null, 2)
  );
  patchRuntimeState({
    telegram: {
      lastUpdateId,
      offsetSavedAt: Date.now(),
    },
  });
}

const convex = new ConvexHttpClient(config.convexUrl);
if (config.convexAdminToken) convex.setAuth(config.convexAdminToken);

function isTransientInfraError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    /enotfound|econnreset|etimedout|fetch failed|networkerror/.test(msg) ||
    /error code 52\d/.test(msg) ||
    /cloudflare/.test(msg)
  );
}

async function withRetry(label, fn, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      if (!isTransientInfraError(error) || attempt >= maxAttempts) throw error;
      const delayMs = Math.min(4000, 250 * 2 ** (attempt - 1));
      console.warn(`[retry] ${label} transient failure (attempt ${attempt}/${maxAttempts}): ${String(error?.message || error)}`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

async function q(ref, args) {
  return withRetry("convex.query", () => convex.query(ref, args));
}
async function m(ref, args) {
  return withRetry("convex.mutation", () => convex.mutation(ref, args));
}

async function telegramApi(method, body) {
  if (!config.telegramBotToken) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

function isAuthorized(chatId, userId) {
  const chatOk =
    config.telegramAllowedChatIds.size === 0 || config.telegramAllowedChatIds.has(String(chatId));
  const userOk =
    config.telegramAllowedUserIds.size === 0 || config.telegramAllowedUserIds.has(String(userId));
  return { chatOk, userOk, ok: chatOk && userOk };
}

function parseIncomingTaskIntent(message) {
  const text = message?.text?.trim();
  if (!text) return { parsedAs: "ignored", createTask: false, reason: "no_text" };
  if (/^\/help\b/i.test(text)) return { parsedAs: "command", createTask: false, command: "help" };
  if (/^\/status\b/i.test(text)) return { parsedAs: "command", createTask: false, command: "status" };
  if (/^\/reopen\b/i.test(text)) return { parsedAs: "command", createTask: false, command: "reopen" };
  if (/^\/task\b/i.test(text)) {
    const payload = text.replace(/^\/task\b/i, "").trim();
    return {
      parsedAs: payload ? "task" : "command",
      createTask: Boolean(payload),
      text: payload || text,
      command: payload ? undefined : "task_empty",
    };
  }
  if (String(message.chat.id) === String(config.telegramIntakeChatId)) {
    return { parsedAs: "task", createTask: true, text };
  }
  return { parsedAs: "ignored", createTask: false, reason: "plain_text_non_intake_chat" };
}

async function sendTelegramText(chatId, text, replyToMessageId) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId,
    disable_web_page_preview: true,
  });
}

async function statusMessageForTask(task, agentsById = new Map()) {
  const assignees = (task.assigneeIds ?? [])
    .map((id) => agentsById.get(String(id))?.name)
    .filter(Boolean)
    .join(", ");
  const reviewer = task.reviewerAgentId ? agentsById.get(String(task.reviewerAgentId))?.name : null;
  let completionBits = [];
  let accountabilityBits = [];

  // For completed tasks, include exact output/storage paths extracted from task evidence.
  if (task.status === "done") {
    try {
      const [taskMessages, taskDocs] = await Promise.all([
        q(api.messages.listByTask, { taskId: task._id }),
        q(api.documents.list, { taskId: task._id }),
      ]);
      const outputPaths = ensureProjectLocalEvidencePaths(
        task,
        extractAbsolutePathEvidence(taskMessages, taskDocs)
      );
      if (outputPaths.length > 0) {
        completionBits = [
          "Confirmation: Task completed and approved.",
          ...outputPaths.slice(0, 5).map((p, i) =>
            outputPaths.length === 1 ? `Stored Location: ${p}` : `Stored Location ${i + 1}: ${p}`
          ),
        ];
      } else {
        completionBits = [
          "Confirmation: Task completed and approved.",
          "Stored Location: path evidence not found in task comments/docs.",
        ];
      }
    } catch (error) {
      console.error("[status] failed to load completion evidence", error);
      completionBits = ["Confirmation: Task completed and approved."];
    }
  }

  if (config.accountabilityLedgerEnabled) {
    try {
      const steps = await listAccountabilitySteps(task._id);
      accountabilityBits = formatAccountabilityMatrix(steps);
    } catch (error) {
      console.error("[status] failed to load accountability steps", error);
    }
  }

  const bits = [
    `Task #${String(task._id)}`,
    `${task.title}`,
    `Status: ${task.status}`,
    assignees ? `Assignee: ${assignees}` : null,
    reviewer ? `Reviewer: ${reviewer}` : null,
    task.reviewStatus ? `Review: ${task.reviewStatus}` : null,
    task.nextAction ? `Next: ${task.nextAction}` : null,
    ...accountabilityBits,
    ...completionBits,
  ].filter(Boolean);
  return bits.join("\n");
}

function inferOpenClawAgentId(agent) {
  const sessionKey = typeof agent?.sessionKey === "string" ? agent.sessionKey : "";
  const match = sessionKey.match(/^agent:([^:]+):/i);
  if (match?.[1]) return match[1];
  const fallback = String(agent?.name || "main")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return fallback || "main";
}

async function runOpenClawAgent({ role, task, prompt, targetAgent }) {
  if (!config.autoDispatchEnabled) return { skipped: true, reason: "AUTO_DISPATCH_DISABLED" };
  const baseArgs = [];
  if (config.openclawProfile) baseArgs.push("--profile", config.openclawProfile);

  const invoke = (agentId) =>
    new Promise((resolve) => {
      const args = [...baseArgs, "agent", "--agent", agentId, "--message", prompt, "--json"];
      const child = spawn(config.openclawBin, args, { cwd: projectRoot });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr, role, taskId: String(task._id), agentId });
      });
    });

  const requestedAgentId = inferOpenClawAgentId(targetAgent);
  const first = await invoke(requestedAgentId);
  const combinedOut = `${first.stderr || ""}\n${first.stdout || ""}`;
  if (
    first.code !== 0 &&
    requestedAgentId !== "main" &&
    /Unknown agent id/i.test(combinedOut)
  ) {
    const strictRoutingForSpecialist = role === "specialist" && config.accountabilityStrictGate;
    if (!config.allowAgentFallbackToMain || strictRoutingForSpecialist) {
      return {
        ...first,
        stderr:
          `[strict-routing] Unknown agent '${requestedAgentId}'. Fallback to main is disabled. ` +
          `Create the missing OpenClaw agent or set ALLOW_AGENT_FALLBACK_TO_MAIN=true.\n` +
          (first.stderr || ""),
      };
    }
    console.warn(
      `[dispatch] unknown agent '${requestedAgentId}' for task ${String(task._id)}; retrying with main`
    );
    const fallback = await invoke("main");
    if (fallback.code === 0) {
      fallback.stdout =
        `[fallback] Requested agent '${requestedAgentId}' not configured; executed via 'main'.\n` +
        (fallback.stdout || "");
    }
    return fallback;
  }

  return first;
}

function chooseSpecialists(task, agents) {
  const t = `${task.title}\n${task.description}\n${(task.labels || []).join(" ")}`.toLowerCase();
  const names = [];
  const has = (name) => agents.find((a) => a.name === name);
  const isCodingTask = isImplementationTask(task);
  const isAnalyticsOpsTask =
    /(latency|metrics|capacity|infrastructure|cpu|database|postgres|mysql|redis|throughput|observability|telemetry|kpi|reporting)/.test(
      t
    ) || (/\bdashboard\b/.test(t) && !isCodingTask);
  if (isCodingTask) names.push("Dev");
  // Do not key off the "telegram-intake" source label; only route to support for support-like requests.
  if (/(incident|ticket|support|login|auth|access|permission|onboarding)/.test(t)) names.push("Natasha");
  if (isAnalyticsOpsTask) names.push("Bruce");
  if (/(runbook|stability|post-mortem|rollback|sla)/.test(t)) names.push("Steve");
  if (/(doc|documentation|guide|onboarding|write)/.test(t)) names.push("Peter");
  if (names.length === 0) names.push("Natasha");
  return [...new Set(names)]
    .map((n) => has(n))
    .filter(Boolean);
}

function inferAcceptanceCriteria(task) {
  const criteria = [];
  criteria.push("Work is documented in task comments with concrete findings.");
  criteria.push("Task status reflects actual progress and next action.");
  if (isImplementationTask(task)) {
    criteria.push("Coding/implementation work includes explicit output path evidence in comments/docs (Output Path: /absolute/path).");
  }
  if (/(runbook|doc|guide|documentation)/i.test(task.title + " " + task.description)) {
    criteria.push("A relevant document/runbook is attached or updated.");
  }
  if (/(incident|critical|urgent|bug|failure|outage)/i.test(task.title + " " + task.description)) {
    criteria.push("Root cause or validated workaround is recorded.");
  }
  return criteria;
}

function formatDelegationQueue(specialists) {
  const names = (specialists ?? []).map((a) => a?.name).filter(Boolean);
  if (names.length === 0) return "No specialist selected";
  if (names.length === 1) return names[0];
  return names.join(" -> ");
}

function requiredProofForStep(task, role) {
  if (role === "reviewer") return "comment_summary";
  if (role === "specialist" && isImplementationTask(task)) return "output_path";
  if (role === "specialist") return "comment_summary";
  return "none";
}

function buildWorkflowSteps(task, specialists, reviewer) {
  const steps = [];
  for (let i = 0; i < specialists.length; i += 1) {
    const specialist = specialists[i];
    steps.push({
      stepIndex: i,
      agentId: specialist._id,
      agentName: specialist.name,
      role: "specialist",
      requiredProof: requiredProofForStep(task, "specialist"),
    });
  }
  if (reviewer) {
    steps.push({
      stepIndex: steps.length,
      agentId: reviewer._id,
      agentName: reviewer.name,
      role: "reviewer",
      requiredProof: "comment_summary",
    });
  }
  return steps;
}

async function listAccountabilitySteps(taskId) {
  if (!config.accountabilityLedgerEnabled) return [];
  try {
    return (await q((api).accountability.listByTask, { taskId })) ?? [];
  } catch (error) {
    console.warn(`[accountability] listByTask failed for ${String(taskId)}: ${String(error?.message || error)}`);
    return [];
  }
}

function findRunningStep(steps = []) {
  return (steps ?? []).find((step) => String(step?.status) === "running");
}

async function ensureAccountabilityWorkflow(task, specialists, reviewer) {
  if (!config.accountabilityLedgerEnabled) return [];
  const steps = buildWorkflowSteps(task, specialists, reviewer);
  if (steps.length === 0) return [];
  try {
    const result = await m((api).accountability.initTaskWorkflow, {
      taskId: task._id,
      steps,
    });
    return result?.steps ?? [];
  } catch (error) {
    console.warn(
      `[accountability] initTaskWorkflow failed for ${String(task?._id || "")}: ${String(
        error?.message || error
      )}`
    );
    return [];
  }
}

async function ensureRunningStepStart(taskId, stepIndex, agentId) {
  if (!config.accountabilityLedgerEnabled) return { ok: true };
  return await m((api).accountability.startStep, {
    taskId,
    stepIndex,
    agentId,
  });
}

async function attachDispatchRunToStep(taskId, stepIndex, dispatchRunId) {
  if (!config.accountabilityLedgerEnabled || !dispatchRunId) return;
  await m((api).accountability.attachDispatchRun, {
    taskId,
    stepIndex,
    dispatchRunId,
  });
}

async function recordAccountabilityProof({ taskId, stepIndex, summary, paths, proofMessageId, proofDocumentIds, dispatchRunId }) {
  if (!config.accountabilityLedgerEnabled) return;
  await m((api).accountability.recordProof, {
    taskId,
    stepIndex,
    proofPayload: {
      summary,
      paths,
      proofMessageId,
      proofDocumentIds,
      dispatchRunId,
    },
  });
}

async function handoffAccountabilityStep(taskId, fromStepIndex, toStepIndex, handoffBy, handoffValid = true) {
  if (!config.accountabilityLedgerEnabled) return;
  await m((api).accountability.handoffStep, {
    taskId,
    fromStepIndex,
    toStepIndex,
    handoffBy,
    handoffValid,
  });
}

async function completeAccountabilityStep(taskId, stepIndex, summary) {
  if (!config.accountabilityLedgerEnabled) return;
  await m((api).accountability.completeStep, {
    taskId,
    stepIndex,
    summary,
  });
}

async function blockAccountabilityStep(taskId, stepIndex, reason, status = "blocked") {
  if (!config.accountabilityLedgerEnabled) return;
  await m((api).accountability.blockStep, {
    taskId,
    stepIndex,
    reason,
    status,
  });
}

async function agentHasRunningWorkElsewhere(agent, currentTaskId) {
  if (!config.accountabilityLedgerEnabled || !agent?._id) return false;
  const rows = await q((api).accountability.currentByAgent, { agentId: agent._id });
  return (rows ?? []).some(
    (row) => String(row.status) === "running" && String(row.taskId) !== String(currentTaskId)
  );
}

function formatAccountabilityMatrix(steps = []) {
  if (!steps || steps.length === 0) return [];
  return [
    "Accountability:",
    ...steps.map((step) => {
      const proof =
        step.requiredProof === "output_path"
          ? (step.proofPaths?.length ?? 0) > 0
            ? "proof:path"
            : "proof:missing_path"
          : step.proofSummary || step.proofMessageId || (step.proofDocumentIds?.length ?? 0) > 0
            ? "proof:ok"
            : "proof:pending";
      return `- [${step.stepIndex}] ${step.agentName} (${step.role}) => ${step.status} (${proof})`;
    }),
  ];
}

function isImplementationTask(task) {
  const text = `${task.title}\n${task.description}\n${(task.labels || []).join(" ")}`.toLowerCase();
  return /(build|develop|code|coding|python|implement|feature|bug|fix|dashboard|script|backend|frontend|api|html|css|website|web site|webpage|landing page|ui|ux)/.test(
    text
  );
}

function isPathInsideDir(parentDir, candidatePath) {
  try {
    const rel = path.relative(path.resolve(parentDir), path.resolve(candidatePath));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function slugifyTaskTitle(title = "") {
  return (
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deliverable"
  );
}

function normalizeExtractedPath(rawPath = "") {
  return String(rawPath)
    .replace(/\\[nrt].*$/i, "")
    .trim()
    .replace(/^[`'"]+/, "")
    .replace(/[`'",.;:!?]+$/, "");
}

function isIgnoredOutputEvidencePath(pathCandidate = "") {
  const p = String(pathCandidate).trim();
  if (!p.startsWith("/")) return true;
  const lower = p.toLowerCase();

  // Ignore generic OpenClaw workspace roots and agent-meta files that are not deliverables.
  if (/\/\.openclaw\/workspace\/?$/.test(lower)) return true;
  if (/\/\.openclaw\/workspace\/(agents|soul|tools|identity|heartbeat)\.md$/.test(lower)) return true;
  if (/\/\.openclaw\/workspace\/memory\/working\.md$/.test(lower)) return true;

  return false;
}

function mirrorPathIntoProject(task, sourcePath) {
  const source = path.resolve(String(sourcePath || ""));
  if (!source.startsWith("/")) return null;
  if (isPathInsideDir(workspaceRoot, source)) return source;
  if (!fs.existsSync(source)) return null;

  const taskPrefix = `${String(task?._id || "task")}-${slugifyTaskTitle(task?.title || "")}`;
  const taskRoot = path.join(deliverablesRoot, taskPrefix);
  fs.mkdirSync(taskRoot, { recursive: true });

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    const destDir = path.join(taskRoot, path.basename(source));
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.cpSync(source, destDir, { recursive: true, force: true });
    return destDir;
  }

  const destFile = path.join(taskRoot, path.basename(source));
  fs.cpSync(source, destFile, { force: true });
  return destFile;
}

function ensureProjectLocalEvidencePaths(task, paths = []) {
  const out = [];
  const seen = new Set();
  for (const p of paths) {
    let finalPath = String(p || "");
    try {
      const mirrored = mirrorPathIntoProject(task, finalPath);
      if (mirrored) finalPath = mirrored;
    } catch (error) {
      console.warn(
        `[deliverables] mirror failed for task ${String(task?._id || "")}: ${String(error?.message || error)}`
      );
    }
    if (!finalPath.startsWith("/")) continue;
    if (!isPathInsideDir(workspaceRoot, finalPath)) continue;
    if (seen.has(finalPath)) continue;
    seen.add(finalPath);
    out.push(finalPath);
  }
  return out;
}

function extractAbsolutePathEvidence(taskMessages = [], taskDocs = []) {
  // Output-path evidence is only trusted when explicitly labeled in task comments/docs.
  // This prevents tool logs or schema dumps from being misread as deliverable evidence.
  const labeledPathPattern =
    /(?:output path|stored location(?:\s+\d+)?|stored path|final output(?: path)?)\s*:\s*(\/[^\s`"')\]\\]+)/gi;

  const corpus = [
    ...taskMessages.map((m) => m?.content || ""),
    ...taskDocs.map((d) => d?.content || ""),
  ].join("\n");

  const found = new Set();
  let match;
  while ((match = labeledPathPattern.exec(corpus)) !== null) {
    const candidate = normalizeExtractedPath(match[1] || "");
    if (!candidate.startsWith("/")) continue;
    if (isIgnoredOutputEvidencePath(candidate)) continue;
    found.add(candidate);
  }
  return [...found];
}

function stripAnsi(text = "") {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "");
}

function summarizeOpenClawRunOutput(result) {
  const raw = stripAnsi(`${result?.stdout || ""}\n${result?.stderr || ""}`);
  const lines = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed = null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === "object") {
      const msg = parsed.message;
      if (msg && Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (!item || typeof item !== "object") continue;
          if (item.type === "text" || item.type === "summary_text") {
            const text = String(item.text || "").trim();
            if (text) lines.push(text);
          }
        }
      } else if (typeof parsed.text === "string" && parsed.text.trim()) {
        lines.push(parsed.text.trim());
      }
      continue;
    }

    lines.push(trimmed);
  }

  const noise = [
    /^\[ws\]/i,
    /^\[gateway\]/i,
    /^\[browser\//i,
    /^\[canvas\]/i,
    /^\[hooks/i,
    /^\[heartbeat\]/i,
    /^\[health-monitor\]/i,
    /^using model\b/i,
    /^tokens?\b/i,
    /^-\s*"name"\s*:\s*"memory_/i,
    /^-\s*"summarychars"\s*:/i,
    /^-\s*"schemachars"\s*:/i,
  ];

  const unique = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    if (noise.some((re) => re.test(normalized))) continue;
    if (normalized.length < 3) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  const clipped = unique
    .slice(-6)
    .map((line) => (line.length > 240 ? `${line.slice(0, 237)}...` : line));
  const outputPaths = extractAbsolutePathEvidence([{ content: raw }], []);
  return { lines: clipped, outputPaths };
}

async function relaySpecialistRunUpdate({ taskId, task, specialist, result }) {
  if (!specialist?._id) return false;
  const summary = summarizeOpenClawRunOutput(result);
  const outputPaths = ensureProjectLocalEvidencePaths(task ?? { _id: taskId, title: "task" }, summary.outputPaths);
  const bits = [
    `Automated relay update from ${specialist.name} (captured from OpenClaw run).`,
    result?.code === 0 ? "Run status: completed." : `Run status: failed (code ${String(result?.code ?? "unknown")}).`,
    summary.lines.length
      ? `Update:\n- ${summary.lines.join("\n- ")}`
      : "Update: No structured progress text was captured from the run output.",
    ...outputPaths.slice(0, 5).map((p, i) => `Stored Location ${i + 1}: ${p}`),
  ];

  await m((api).messages.create, {
    taskId,
    fromAgentId: specialist._id,
    fromName: specialist.name,
    content: bits.filter(Boolean).join("\n\n"),
  });
  return true;
}

async function inspectTaskEvidence(taskId) {
  const [task, taskMessages, taskDocs] = await Promise.all([
    q(api.tasks.get, { id: taskId }),
    q(api.messages.listByTask, { taskId }),
    q(api.documents.list, { taskId }),
  ]);
  const chiefName = String(config.chiefAgentName || "").toLowerCase();
  const nonChiefMessages = (taskMessages ?? []).filter((m) => {
    const from = String(m?.fromName || "").toLowerCase();
    return from && from !== chiefName;
  });
  return {
    taskMessages,
    taskDocs,
    hasEvidence: (taskMessages?.length ?? 0) > 0 || (taskDocs?.length ?? 0) > 0,
    hasAssigneeEvidence: nonChiefMessages.length > 0 || (taskDocs?.length ?? 0) > 0,
    outputPaths: ensureProjectLocalEvidencePaths(
      task ?? { _id: taskId, title: "task" },
      extractAbsolutePathEvidence(taskMessages, taskDocs)
    ),
  };
}

async function getAgentMap() {
  const agents = await q(api.agents.list, {});
  return {
    list: agents,
    byName: new Map(agents.map((a) => [a.name, a])),
    byId: new Map(agents.map((a) => [String(a._id), a])),
  };
}

async function processTelegramMessage(message, receivedVia) {
  if (!message || !message.chat || !message.from) return;
  const auth = isAuthorized(message.chat.id, message.from.id);
  if (!auth.ok) {
    await sendTelegramText(
      message.chat.id,
      "Unauthorized for Mission Control task intake.",
      message.message_id
    ).catch(() => {});
    return;
  }

  const intent = parseIncomingTaskIntent(message);
  if (intent.command === "help") {
    await sendTelegramText(
      message.chat.id,
      "Mission Control bot commands:\n/task <description>\n/status <task-id>\n/reopen <task-id> <reason>\n(Plain text creates tasks only in the intake chat.)",
      message.message_id
    );
    return;
  }
  if (intent.command === "task_empty") {
    await sendTelegramText(message.chat.id, "Usage: /task <description>", message.message_id);
    return;
  }
  if (intent.command === "status") {
    const match = message.text.match(/^\/status\s+([a-z0-9]+)/i);
    if (!match) {
      await sendTelegramText(message.chat.id, "Usage: /status <task-id>", message.message_id);
      return;
    }
    const tasks = await q(api.tasks.list, {});
    const task = tasks.find((t) => String(t._id).includes(match[1]));
    if (!task) {
      await sendTelegramText(message.chat.id, `Task ${match[1]} not found`, message.message_id);
      return;
    }
    const agents = await getAgentMap();
    await sendTelegramText(
      message.chat.id,
      await statusMessageForTask(task, agents.byId),
      message.message_id
    );
    return;
  }
  if (intent.command === "reopen") {
    const match = message.text.match(/^\/reopen\s+([a-z0-9]+)\s*(.*)$/i);
    if (!match) {
      await sendTelegramText(message.chat.id, "Usage: /reopen <task-id> <reason>", message.message_id);
      return;
    }
    const tasks = await q(api.tasks.list, {});
    const task = tasks.find((t) => String(t._id).includes(match[1]));
    if (!task) {
      await sendTelegramText(message.chat.id, `Task ${match[1]} not found`, message.message_id);
      return;
    }
    const agents = await getAgentMap();
    const chief = agents.byName.get(config.chiefAgentName);
    await m((api).automation.reopenTaskAfterReview, {
      taskId: task._id,
      chiefAgentId: chief?._id,
      chiefAgentName: chief?.name,
      reason: match[2]?.trim() || "Reopened from Telegram command",
    });
    await sendTelegramText(message.chat.id, `Reopened task ${String(task._id)} for rework.`, message.message_id);
    return;
  }

  const ingest = await m((api).telegram.ingestTelegramUpdate, {
    updateId: message.update_id ?? 0,
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    messageId: message.message_id,
    text: intent.text ?? message.text ?? "",
    username: message.from.username,
    displayName: [message.from.first_name, message.from.last_name].filter(Boolean).join(" "),
    receivedVia,
    parsedAs: intent.parsedAs,
    createTask: intent.createTask,
    chiefAgentName: config.chiefAgentName,
  });

  if (ingest?.deduped) return;
  if (ingest?.taskId) {
    await sendTelegramText(
      message.chat.id,
      `Mission Control task created.\nTask ID: ${String(ingest.taskId)}\nStatus: inbox`,
      message.message_id
    ).catch(() => {});
  }
}

async function processTelegramUpdate(update, receivedVia) {
  if (!update) return;
  patchRuntimeState({
    telegram: {
      lastInboundUpdateId: update.update_id ?? null,
      lastInboundAt: Date.now(),
      lastInboundVia: receivedVia,
    },
  });
  if (update.message) {
    update.message.update_id = update.update_id;
    await processTelegramMessage(update.message, receivedVia);
  }
}

async function pollingLoop(signal) {
  let offset = loadOffset();
  markLoopHeartbeat("poller", { status: "started", offset });
  while (!signal.aborted && config.telegramPollingEnabled && config.telegramBotToken) {
    try {
      markLoopHeartbeat("poller", { status: "polling", offset });
      const updates = await telegramApi("getUpdates", {
        offset: offset + 1,
        timeout: 20,
        allowed_updates: ["message"],
      });
      for (const u of updates) {
        await processTelegramUpdate(u, "poller");
        offset = Math.max(offset, u.update_id);
        saveOffset(offset);
      }
      markLoopHeartbeat("poller", { status: "idle", offset, batchCount: updates.length });
    } catch (error) {
      console.error("[poller] error", error);
      recordRuntimeError("poller", error);
      markLoopHeartbeat("poller", { status: "error", offset });
      await sleep(config.telegramPollIntervalMs);
    }
  }
  markLoopHeartbeat("poller", { status: "stopped", offset });
}

function startWebhookServer(signal) {
  if (!config.telegramWebhookEnabled) return null;
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method !== "POST" || req.url !== config.telegramWebhookPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const update = JSON.parse(body);
        await processTelegramUpdate(update, "webhook");
        res.writeHead(200);
        res.end("ok");
      } catch (e) {
        console.error("[webhook] error", e);
        res.writeHead(400);
        res.end("bad request");
      }
    });
  });
  server.on("error", (err) => {
    console.error("[webhook] listen failed, continuing without webhook:", err.message);
  });
  server.listen(config.telegramWebhookPort, "0.0.0.0", () => {
    console.log(`[webhook] listening on :${config.telegramWebhookPort}${config.telegramWebhookPath}`);
  });
  signal.addEventListener("abort", () => server.close());
  return server;
}

async function chiefTriageLoop(signal) {
  markLoopHeartbeat("chiefTriage", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("chiefTriage", { status: "loop" });
      if (!config.autoTriageEnabled) {
        await sleep(5000);
        continue;
      }
      const agents = await getAgentMap();
      const chief = agents.byName.get(config.chiefAgentName);
      if (!chief) {
        console.warn("[triage] chief agent not found");
        await sleep(15000);
        continue;
      }
      const claimed = await m((api).automation.claimNextInboxTaskForChief, {
        chiefAgentId: chief._id,
        chiefAgentName: chief.name,
      });
      if (!claimed) {
        await sleep(3000);
        continue;
      }

      const specialists = chooseSpecialists(claimed, agents.list);
      const primarySpecialist = specialists[0];
      const acceptanceCriteria = inferAcceptanceCriteria(claimed);
      const nextAction = specialists.length
        ? specialists.length === 1
          ? `Assigned to ${specialists[0].name} for execution and updates`
          : `Sequential delegation planned (one agent at a time): ${formatDelegationQueue(specialists)}`
        : "Chief triage follow-up required";

      const summaryComment =
        `### Chief Triage (Jarvis)\n` +
        `- Priority: ${claimed.priority}\n` +
        `- Assumptions: Best-effort classification from Telegram intake / task context\n` +
        `- Expected output: Concrete findings + status updates + evidence in comments/docs\n` +
        `- Next action: ${nextAction}\n` +
        `- Review gate: Reviewer validates correctness before done\n`;

      const labels = [...new Set([...(claimed.labels ?? []), "auto-managed"])];
      await m((api).automation.setChiefTriageResult, {
        taskId: claimed._id,
        chiefAgentId: chief._id,
        chiefAgentName: chief.name,
        assigneeIds: primarySpecialist ? [primarySpecialist._id] : [],
        priority: claimed.priority,
        labels,
        acceptanceCriteria,
        nextAction,
        staleAfterMinutes: claimed.staleAfterMinutes ?? config.taskStaleDefaultMinutes,
        summaryComment,
      });

      await m((api).automation.createAutomationRun, {
        taskId: claimed._id,
        role: "chief",
        agentName: chief.name,
        dispatchType: "triage",
        status: "succeeded",
        attempt: 1,
        inputSummary: "Inbox task triage",
        outputSummary: `Assigned ${specialists.map((a) => a.name).join(", ") || "none"}`,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      });

      if (specialists.length > 0) {
        await m(api.tasks.updateStatus, {
          id: claimed._id,
          status: "in_progress",
          agentId: chief._id,
          agentName: chief.name,
        });
        await m((api).automation.updateTaskAutomationState, {
          taskId: claimed._id,
          automationState: "executing",
          reviewStatus: "pending",
          nextAction:
            specialists.length === 1
              ? `Execution in progress by ${specialists[0].name}`
              : `Execution in progress by ${specialists[0].name} (delegation queue: ${specialists
                  .slice(1)
                  .map((a) => a.name)
                  .join(", ")})`,
        });
      }

      const reviewer = agents.byName.get(config.reviewerAgentName);
      const workflowSteps = await ensureAccountabilityWorkflow(claimed, specialists, reviewer);
      const reviewerStep = workflowSteps.find((step) => step.role === "reviewer");

      for (let i = 0; i < specialists.length; i++) {
        const specialist = specialists[i];
        const nextSpecialist = specialists[i + 1];
        const stepIndex = i;

        const specialistBusyElsewhere = await agentHasRunningWorkElsewhere(specialist, claimed._id);
        if (specialistBusyElsewhere) {
          await m(api.tasks.updateStatus, {
            id: claimed._id,
            status: "assigned",
            agentId: chief._id,
            agentName: chief.name,
          });
          await m((api).automation.updateTaskAutomationState, {
            taskId: claimed._id,
            automationState: "assigned",
            reviewStatus: "pending",
            nextAction: `${specialist.name} already has an active task. Queued until that task completes.`,
          });
          await m((api).automation.setTaskNextCheck, {
            taskId: claimed._id,
            nextCheckAt: Date.now() + 2 * 60 * 1000,
            nextAction: `Queued: waiting for ${specialist.name} to become available`,
            chiefAgentId: chief._id,
          });
          await m((api).messages.create, {
            taskId: claimed._id,
            fromAgentId: chief._id,
            fromName: chief.name,
            content:
              `Chief queue control: ${specialist.name} is already running another task. ` +
              `This task is queued in assigned and will resume when ${specialist.name} is free.`,
          });
          break;
        }

        const started = await ensureRunningStepStart(claimed._id, stepIndex, specialist._id);
        if (!started?.ok) {
          await m((api).automation.setTaskNextCheck, {
            taskId: claimed._id,
            nextCheckAt: Date.now() + 2 * 60 * 1000,
            nextAction: `Accountability step lock: waiting to start step ${stepIndex} for ${specialist.name}`,
            chiefAgentId: chief._id,
          });
          await m((api).messages.create, {
            taskId: claimed._id,
            fromAgentId: chief._id,
            fromName: chief.name,
            content:
              `Chief monitor: accountability lock prevented starting ${specialist.name}'s step (${stepIndex}). ` +
              `A different step is still running.`,
          });
          break;
        }

        if (i > 0) {
          // Enforce single-assignee execution: hand off to the next specialist only after the prior turn completes.
          await m(api.tasks.assign, {
            id: claimed._id,
            assigneeIds: [specialist._id],
            agentName: chief.name,
          });
          await m(api.tasks.updateStatus, {
            id: claimed._id,
            status: "in_progress",
            agentId: chief._id,
            agentName: chief.name,
          });
          await m((api).automation.updateTaskAutomationState, {
            taskId: claimed._id,
            automationState: "executing",
            reviewStatus: "pending",
            nextAction: nextSpecialist
              ? `Execution in progress by ${specialist.name} (next planned handoff: ${nextSpecialist.name})`
              : `Execution in progress by ${specialist.name}`,
          });
          await m((api).messages.create, {
            taskId: claimed._id,
            fromAgentId: chief._id,
            fromName: chief.name,
            content: `Chief handoff: assigning ${specialist.name} next. Policy: one active assignee at a time.`,
          });
        }

        const preDispatchTask = await q(api.tasks.get, { id: claimed._id });
        const preDispatchMessages = await q(api.messages.listByTask, { taskId: claimed._id });
        const preDispatchCommentCount = Number(preDispatchTask?.commentCount ?? 0);
        const preDispatchAttachmentCount = Number(preDispatchTask?.attachmentCount ?? 0);
        const preDispatchMessageCount = Number(preDispatchMessages?.length ?? 0);

        const prompt =
          `Mission Control task ${String(claimed._id)} assigned to ${specialist.name}.\n` +
          `Role: ${specialist.role}\n` +
          `Task: ${claimed.title}\n` +
          `Description:\n${claimed.description}\n\n` +
          `You are a specialist executor. Do the work, post findings to Mission Control comments/docs, and update task status. ` +
          `Do not close directly to done; submit for review.` +
          (isImplementationTask(claimed)
            ? ` For implementation/coding tasks, your final evidence must include an explicit absolute path line in the form ` +
              `Output Path: /absolute/path (or Stored Location: /absolute/path). ` +
              `Store the deliverable inside the project folder under ${deliverablesRoot}/...`
            : "");
        const start = Date.now();
        const result = await runOpenClawAgent({
          role: "specialist",
          task: claimed,
          prompt,
          targetAgent: specialist,
        });
        const specialistRunId = await m((api).automation.createAutomationRun, {
          taskId: claimed._id,
          role: "specialist",
          agentName: specialist.name,
          dispatchType: "execution",
          status: result.code === 0 ? "succeeded" : "failed",
          attempt: 1,
          inputSummary: `Dispatch to ${specialist.name}`,
          outputSummary:
            result.code === 0
              ? "OpenClaw dispatch invoked"
              : `Dispatch failed (${String(result.code)})`,
          error: result.code === 0 ? undefined : String(result.stderr || result.stdout).slice(0, 500),
          startedAt: start,
          finishedAt: Date.now(),
        });
        await attachDispatchRunToStep(claimed._id, stepIndex, specialistRunId);

        if (result.code === 0) {
          await m((api).automation.recordAssigneeHeartbeat, {
            taskId: claimed._id,
            agentId: specialist._id,
            agentName: specialist.name,
            note: `Automation dispatch triggered for ${specialist.name}`,
          });
          await m(api.agents.updateStatus, {
            id: specialist._id,
            status: "active",
            currentTaskId: claimed._id,
          });
          let postDispatchTask = await q(api.tasks.get, { id: claimed._id });
          let postDispatchMessages = await q(api.messages.listByTask, { taskId: claimed._id });
          let evidenceProgress =
            Number(postDispatchTask?.commentCount ?? 0) > preDispatchCommentCount ||
            Number(postDispatchTask?.attachmentCount ?? 0) > preDispatchAttachmentCount;
          let taskLeftExecution =
            postDispatchTask?.status === "review" || postDispatchTask?.status === "done";
          const specialistCommentPosted = (postDispatchMessages ?? [])
            .slice(preDispatchMessageCount)
            .some((msg) => String(msg?.fromName || "").toLowerCase() === String(specialist.name || "").toLowerCase());

          if (!specialistCommentPosted) {
            const relayPosted = await relaySpecialistRunUpdate({
              taskId: claimed._id,
              task: claimed,
              specialist,
              result,
            });
            // Re-read task state after relay so we don't emit a false "no evidence" chief comment.
            if (relayPosted) {
              postDispatchTask = await q(api.tasks.get, { id: claimed._id });
              postDispatchMessages = await q(api.messages.listByTask, { taskId: claimed._id });
              evidenceProgress =
                Number(postDispatchTask?.commentCount ?? 0) > preDispatchCommentCount ||
                Number(postDispatchTask?.attachmentCount ?? 0) > preDispatchAttachmentCount ||
                Number(postDispatchMessages?.length ?? 0) > preDispatchMessageCount;
              taskLeftExecution =
                postDispatchTask?.status === "review" || postDispatchTask?.status === "done";
            }
          }

          const specialistProofMessage = [...(postDispatchMessages ?? [])]
            .slice(preDispatchMessageCount)
            .reverse()
            .find(
              (msg) =>
                String(msg?.fromName || "").toLowerCase() ===
                String(specialist.name || "").toLowerCase()
            );
          const evidenceAfterRun = await inspectTaskEvidence(claimed._id);
          const summaryAfterRun = summarizeOpenClawRunOutput(result);

          if (!evidenceProgress && !taskLeftExecution) {
            if (config.accountabilityStrictGate) {
              await blockAccountabilityStep(
                claimed._id,
                stepIndex,
                "missing_step_proof: no assignee evidence was posted after specialist dispatch",
                "blocked"
              );
            }
            await m((api).automation.updateTaskAutomationState, {
              taskId: claimed._id,
              automationState: "executing",
              reviewStatus: "pending",
              nextAction: nextSpecialist
                ? `Waiting on ${specialist.name} evidence/update before handoff to ${nextSpecialist.name}`
                : `Awaiting final evidence/update from ${specialist.name}, then review`,
            });
            await m((api).automation.setTaskNextCheck, {
              taskId: claimed._id,
              nextCheckAt: Date.now() + 5 * 60 * 1000,
              nextAction: nextSpecialist
                ? `Waiting on ${specialist.name} evidence/update before handoff to ${nextSpecialist.name}`
                : `Awaiting final evidence/update from ${specialist.name}, then review`,
              chiefAgentId: chief._id,
            });
            await m((api).messages.create, {
              taskId: claimed._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content: nextSpecialist
                ? `Chief monitor: dispatch reached ${specialist.name}, but no new task evidence was posted yet. Handoff to ${nextSpecialist.name} is paused until ${specialist.name} posts a concrete update/output path.`
                : `Chief monitor: dispatch reached ${specialist.name}, but no final evidence/output path is posted yet (use \`Output Path:\` or \`Stored Location:\`). Review handoff is paused until evidence appears.`,
            });
            break;
          }

          await recordAccountabilityProof({
            taskId: claimed._id,
            stepIndex,
            summary: summaryAfterRun.lines.join(" | "),
            paths: evidenceAfterRun.outputPaths ?? [],
            proofMessageId: specialistProofMessage?._id,
            proofDocumentIds: [],
            dispatchRunId: specialistRunId,
          });

          if (nextSpecialist) {
            await handoffAccountabilityStep(claimed._id, stepIndex, stepIndex + 1, chief.name, true);
            await m(api.agents.updateStatus, {
              id: specialist._id,
              status: "active",
            });
            await m((api).messages.create, {
              taskId: claimed._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content: `Chief monitor: ${specialist.name} completed a work turn. Preparing immediate handoff to ${nextSpecialist.name}.`,
            });
          } else {
            const evidence = await inspectTaskEvidence(claimed._id);
            const codingTask = isImplementationTask(claimed);
            const hasOutputPathEvidence = evidence.outputPaths.length > 0;
            const hasReadyEvidence =
              evidence.hasAssigneeEvidence && (!codingTask || hasOutputPathEvidence);

            if (
              config.autoSubmitReadyTasksToReview &&
              reviewer &&
              hasReadyEvidence
            ) {
              if (reviewerStep) {
                await handoffAccountabilityStep(
                  claimed._id,
                  stepIndex,
                  Number(reviewerStep.stepIndex),
                  chief.name,
                  true
                );
              } else {
                await completeAccountabilityStep(
                  claimed._id,
                  stepIndex,
                  `Final specialist proof accepted by ${chief.name}.`
                );
              }
              await m((api).automation.submitForReview, {
                taskId: claimed._id,
                reviewerAgentId: reviewer._id,
                requesterAgentId: chief._id,
                requesterAgentName: chief.name,
                note: `Chief auto-submitted '${claimed.title}' for review immediately after final specialist turn.`,
              });
              await m((api).messages.create, {
                taskId: claimed._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                content:
                  `Chief monitor: Final specialist turn completed with evidence${codingTask ? " (including output path)" : ""}. ` +
                  `Auto-submitting to ${reviewer.name} for review now.`,
              });
            } else {
              await m((api).automation.updateTaskAutomationState, {
                taskId: claimed._id,
                automationState: "executing",
                reviewStatus: "pending",
                nextAction: `Awaiting final evidence/update from ${specialist.name}, then review`,
              });
              await m((api).automation.setTaskNextCheck, {
                taskId: claimed._id,
                nextCheckAt: Date.now() + 5 * 60 * 1000,
                nextAction: codingTask
                  ? `Awaiting final evidence from ${specialist.name} (include Output Path/Stored Location), then review`
                  : `Awaiting final evidence/update from ${specialist.name}, then review`,
                chiefAgentId: chief._id,
              });
              await m((api).messages.create, {
                taskId: claimed._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                content: codingTask
                  ? `Chief monitor: ${specialist.name} finished a turn but final coding evidence is incomplete. Please post a concrete summary and an explicit \`Output Path:\` (or \`Stored Location:\`) so review can start immediately.`
                  : `Chief monitor: ${specialist.name} finished a turn but final evidence/update is still needed before review.`,
              });
              if (config.accountabilityStrictGate) {
                await blockAccountabilityStep(
                  claimed._id,
                  stepIndex,
                  codingTask
                    ? "missing_output_path: final specialist output path evidence not present"
                    : "missing_assignee_evidence: final specialist evidence incomplete",
                  "blocked"
                );
              }
            }
          }
        } else {
          const dispatchError = String(result.stderr || result.stdout || "Unknown dispatch error").slice(0, 500);
          await blockAccountabilityStep(
            claimed._id,
            stepIndex,
            `dispatch_failed: ${dispatchError}`,
            "failed"
          );
          await m((api).automation.updateTaskAutomationState, {
            taskId: claimed._id,
            automationState: "errored",
            reviewStatus: "pending",
            nextAction: `Dispatch failed for ${specialist.name}; check automation run error and retry`,
          });
          await m((api).messages.create, {
            taskId: claimed._id,
            fromAgentId: chief._id,
            fromName: chief.name,
            content:
              `Dispatch failed for ${specialist.name}.\n` +
              `Please investigate OpenClaw agent routing / availability and retry.\n\n` +
              `Error (truncated): ${dispatchError}`,
          });
          break;
        }
      }
    } catch (error) {
      console.error("[triage] error", error);
      recordRuntimeError("chiefTriage", error);
      markLoopHeartbeat("chiefTriage", { status: "error" });
    }
    await sleep(1500);
  }
  markLoopHeartbeat("chiefTriage", { status: "stopped" });
}

async function chiefWatchdogLoop(signal) {
  markLoopHeartbeat("chiefWatchdog", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("chiefWatchdog", { status: "loop" });
      const agents = await getAgentMap();
      const chief = agents.byName.get(config.chiefAgentName);
      if (!chief) {
        await sleep(config.chiefMonitorIntervalMs);
        continue;
      }
      const due = await q((api).automation.listWatchdogCandidates, {
        now: Date.now(),
        limit: 30,
      });
      for (const task of due) {
        if (task.status === "review" && config.autoReviewEnabled) {
          await handleReviewTask(task, agents);
          continue;
        }
        if (task.status === "in_progress") {
          const reviewer = agents.byName.get(config.reviewerAgentName);
          const health = config.accountabilityLedgerEnabled
            ? await q((api).accountability.taskHealth, {
                taskId: task._id,
                staleMinutes: config.accountabilityStepStaleMinutes,
              })
            : null;
          const runningStep = health?.runningStep;
          const runningStepAssignee = runningStep
            ? agents.byId.get(String(runningStep.agentId))
            : null;
          if (health?.stale && runningStep) {
            const stuckReason = `no_assignee_progress: no specialist proof in last ${config.accountabilityStepStaleMinutes}m`;
            await blockAccountabilityStep(
              task._id,
              Number(runningStep.stepIndex),
              stuckReason,
              "blocked"
            );
            await m(api.tasks.updateStatus, {
              id: task._id,
              status: "blocked",
              agentId: chief._id,
              agentName: chief.name,
            });
            await m((api).automation.updateTaskAutomationState, {
              taskId: task._id,
              automationState: "errored",
              reviewStatus: task.reviewStatus ?? "pending",
              nextAction: `Blocked by accountability watchdog: ${runningStep.agentName} is stale`,
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content:
                `Chief watchdog: ${runningStep.agentName} step is stale for more than ${config.accountabilityStepStaleMinutes} minutes. ` +
                `Task moved to blocked until assignee posts concrete evidence.`,
            });
            if (task.source === "telegram" && task.sourceRef?.chatId) {
              try {
                await sendTelegramText(
                  task.sourceRef.chatId,
                  `Alert: Task #${String(task._id)} blocked by watchdog (${runningStep.agentName} stale > ${config.accountabilityStepStaleMinutes}m).`
                );
              } catch (e) {
                console.error("[watchdog] telegram stale alert failed", e);
              }
            }
            continue;
          }
          const evidence = await inspectTaskEvidence(task._id);
          const codingTask = isImplementationTask(task);
          const hasOutputPathEvidence = evidence.outputPaths.length > 0;
          const hasReadyEvidence =
            evidence.hasAssigneeEvidence && (!codingTask || hasOutputPathEvidence);
          const assignee = (task.assigneeIds ?? [])
            .map((id) => agents.byId.get(String(id)))
            .find(Boolean) ?? runningStepAssignee;
          const runs = await q((api).automation.listAutomationRunsByTask, { taskId: task._id });
          const latestSpecialistRun = (runs ?? []).find(
            (r) =>
              r.role === "specialist" &&
              (r.dispatchType === "execution" || r.dispatchType === "monitor") &&
              (r.status === "succeeded" || r.status === "failed")
          );
          const lastSpecialistDispatchAt = Number(
            latestSpecialistRun?.finishedAt ?? latestSpecialistRun?.startedAt ?? 0
          );
          const lastChiefTouchAt = Number(task.lastChiefCheckAt ?? 0);

          if (
            config.autoRedispatchStaleExecutionEnabled &&
            assignee &&
            !hasReadyEvidence &&
            lastChiefTouchAt > 0 &&
            lastSpecialistDispatchAt > 0 &&
            lastSpecialistDispatchAt < lastChiefTouchAt
          ) {
            const preDispatchTask = await q(api.tasks.get, { id: task._id });
            const preDispatchMessages = await q(api.messages.listByTask, { taskId: task._id });
            const preDispatchMessageCount = Number(preDispatchMessages?.length ?? 0);
            const retryPrompt =
              `Mission Control watchdog retry for task ${String(task._id)} assigned to ${assignee.name}.\n` +
              `Role: ${assignee.role}\n` +
              `Task: ${task.title}\n` +
              `Description:\n${task.description}\n\n` +
              `Previous run did not produce valid deliverable evidence. ` +
              `Do the implementation work and post a concrete update in Mission Control comments/docs.` +
              (codingTask
                ? ` Include an explicit absolute path line: Output Path: /absolute/path (or Stored Location: /absolute/path). ` +
                  `Store the deliverable inside the project folder under ${deliverablesRoot}/...`
                : "");
            const retryStart = Date.now();
            const retryResult = await runOpenClawAgent({
              role: "specialist",
              task,
              prompt: retryPrompt,
              targetAgent: assignee,
            });
            const retryRunId = await m((api).automation.createAutomationRun, {
              taskId: task._id,
              role: "specialist",
              agentName: assignee.name,
              dispatchType: "monitor",
              status: retryResult.code === 0 ? "succeeded" : "failed",
              attempt: Number(task.escalationLevel ?? 0) + 1,
              inputSummary: `Watchdog retry dispatch to ${assignee.name}`,
              outputSummary:
                retryResult.code === 0
                  ? "Watchdog redispatch invoked"
                  : `Watchdog redispatch failed (${String(retryResult.code)})`,
              error:
                retryResult.code === 0
                  ? undefined
                  : String(retryResult.stderr || retryResult.stdout || "").slice(0, 500),
              startedAt: retryStart,
              finishedAt: Date.now(),
            });
            if (runningStep) {
              await attachDispatchRunToStep(task._id, Number(runningStep.stepIndex), retryRunId);
            }

            if (retryResult.code === 0) {
              await m((api).automation.recordAssigneeHeartbeat, {
                taskId: task._id,
                agentId: assignee._id,
                agentName: assignee.name,
                note: `Chief watchdog re-dispatched ${assignee.name} after stale execution state`,
              });
              await m(api.agents.updateStatus, {
                id: assignee._id,
                status: "active",
                currentTaskId: task._id,
              });
              const postDispatchMessages = await q(api.messages.listByTask, { taskId: task._id });
              const specialistCommentPosted = (postDispatchMessages ?? [])
                .slice(preDispatchMessageCount)
                .some(
                  (msg) =>
                    String(msg?.fromName || "").toLowerCase() ===
                    String(assignee.name || "").toLowerCase()
                );
              if (!specialistCommentPosted) {
                await relaySpecialistRunUpdate({
                  taskId: task._id,
                  task,
                  specialist: assignee,
                  result: retryResult,
                });
              }
              const refreshedEvidence = await inspectTaskEvidence(task._id);
              const refreshedHasOutput = refreshedEvidence.outputPaths.length > 0;
              const refreshedReady =
                refreshedEvidence.hasAssigneeEvidence && (!codingTask || refreshedHasOutput);
              if (runningStep) {
                const retryMessages = await q(api.messages.listByTask, { taskId: task._id });
                const proofMessage = [...(retryMessages ?? [])]
                  .reverse()
                  .find(
                    (msg) =>
                      String(msg?.fromName || "").toLowerCase() ===
                      String(assignee.name || "").toLowerCase()
                  );
                await recordAccountabilityProof({
                  taskId: task._id,
                  stepIndex: Number(runningStep.stepIndex),
                  summary: summarizeOpenClawRunOutput(retryResult).lines.join(" | "),
                  paths: refreshedEvidence.outputPaths,
                  proofMessageId: proofMessage?._id,
                  proofDocumentIds: [],
                  dispatchRunId: retryRunId,
                });
              }
              if (
                config.autoSubmitReadyTasksToReview &&
                reviewer &&
                refreshedReady &&
                task.reviewStatus !== "approved"
              ) {
                const refreshSteps = await listAccountabilitySteps(task._id);
                const reviewerStep = refreshSteps.find((s) => s.role === "reviewer");
                if (runningStep && reviewerStep) {
                  await handoffAccountabilityStep(
                    task._id,
                    Number(runningStep.stepIndex),
                    Number(reviewerStep.stepIndex),
                    chief.name,
                    true
                  );
                } else if (runningStep) {
                  await completeAccountabilityStep(
                    task._id,
                    Number(runningStep.stepIndex),
                    `Watchdog accepted specialist evidence from ${assignee.name}.`
                  );
                }
                await m((api).automation.submitForReview, {
                  taskId: task._id,
                  reviewerAgentId: reviewer._id,
                  requesterAgentId: chief._id,
                  requesterAgentName: chief.name,
                  note: `Chief watchdog auto-submitted '${task.title}' for review after retry dispatch produced evidence-ready progress.`,
                });
                await m((api).messages.create, {
                  taskId: task._id,
                  fromAgentId: chief._id,
                  fromName: chief.name,
                  content:
                    `Chief watchdog retry: ${assignee.name} posted evidence${codingTask ? " (including output path)" : ""}. ` +
                    `Auto-submitting to ${reviewer.name} for review.`,
                });
                continue;
              }
              await m((api).automation.setTaskNextCheck, {
                taskId: task._id,
                nextCheckAt: Date.now() + 5 * 60 * 1000,
                nextAction: codingTask
                  ? `Awaiting ${assignee.name} implementation evidence with Output Path/Stored Location after watchdog redispatch`
                  : `Awaiting ${assignee.name} evidence/update after watchdog redispatch`,
                chiefAgentId: chief._id,
              });
              await m((api).messages.create, {
                taskId: task._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                content:
                  `Chief watchdog retry: re-dispatched ${assignee.name} because the task stayed in Active without valid evidence. ` +
                  `Waiting for a concrete update${codingTask ? " with Output Path/Stored Location" : ""}.`,
              });
              continue;
            } else {
              if (runningStep) {
                await blockAccountabilityStep(
                  task._id,
                  Number(runningStep.stepIndex),
                  "dispatch_failed: watchdog redispatch failed",
                  "failed"
                );
              }
              await m((api).automation.updateTaskAutomationState, {
                taskId: task._id,
                automationState: "errored",
                reviewStatus: task.reviewStatus ?? "pending",
                nextAction: `Watchdog redispatch failed for ${assignee.name}; investigate OpenClaw/Convex connectivity`,
              });
              await m((api).messages.create, {
                taskId: task._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                content:
                  `Chief watchdog retry failed for ${assignee.name}. ` +
                  `Likely agent/runtime connectivity issue. Error (truncated): ${String(
                    retryResult.stderr || retryResult.stdout || "unknown"
                  ).slice(0, 400)}`,
              });
              // Fall through to normal follow-up/escalation handling below.
            }
          }

          if (
            config.autoSubmitReadyTasksToReview &&
            reviewer &&
            hasReadyEvidence &&
            task.reviewStatus !== "approved"
          ) {
            await m((api).automation.submitForReview, {
              taskId: task._id,
              reviewerAgentId: reviewer._id,
              requesterAgentId: chief._id,
              requesterAgentName: chief.name,
              note: `Chief auto-submitted '${task.title}' for review after detecting evidence-ready progress in task comments/docs.`,
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content:
                `Chief monitor: Evidence is present${codingTask ? " (including output path)" : ""}. ` +
                `Auto-submitting to ${reviewer.name} for review to prevent Active-state stall.`,
            });
            continue;
          }

          const followupsSent = Number(task.escalationLevel ?? 0);
          const aboutToExceedFollowupLimit =
            followupsSent >= Math.max(0, config.maxChiefFollowupsBeforeBlocking - 1);
          const missingEvidence = !evidence.hasAssigneeEvidence;
          const missingOutputPath = codingTask && !hasOutputPathEvidence;

          if (
            config.autoBlockStaleExecutionEnabled &&
            aboutToExceedFollowupLimit &&
            (missingEvidence || missingOutputPath)
          ) {
            const blockReason = missingEvidence
              ? `No assignee evidence/comments/docs after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s).`
              : `Implementation task still missing explicit output path evidence after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s).`;
            await m(api.tasks.updateStatus, {
              id: task._id,
              status: "blocked",
              agentId: chief._id,
              agentName: chief.name,
            });
            await m((api).automation.updateTaskAutomationState, {
              taskId: task._id,
              automationState: "errored",
              reviewStatus: task.reviewStatus ?? "pending",
              nextAction: missingEvidence
                ? "Blocked: assignee must post concrete implementation evidence before retry"
                : "Blocked: assignee must post explicit Output Path/Stored Location evidence before review",
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content:
                `Chief auto-blocked to prevent indefinite Active-state stall.\n` +
                `Reason: ${blockReason}\n` +
                `Required recovery: post concrete progress evidence${codingTask ? " and an explicit Output Path: /absolute/path (or Stored Location: /absolute/path)" : ""}, then reopen/retry.`,
            });
            await m((api).automation.setTaskNextCheck, {
              taskId: task._id,
              nextCheckAt:
                Date.now() + (task.staleAfterMinutes ?? config.taskStaleDefaultMinutes) * 60 * 1000,
              nextAction: missingEvidence
                ? "Awaiting assignee evidence to unblock task"
                : "Awaiting explicit output path evidence to unblock task",
              chiefAgentId: chief._id,
            });
            continue;
          }
        }
        const reason =
          task.status === "blocked"
            ? "Task remains blocked past monitoring window"
            : "No recent assignee update; requesting progress update";
        await m((api).automation.markTaskEscalated, {
          taskId: task._id,
          chiefAgentId: chief._id,
          chiefAgentName: chief.name,
          reason,
        });
        await m(api.messages.create, {
          taskId: task._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          content: `Chief follow-up: ${reason}. Please post concrete status, next action, and blockers.`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: Date.now() + (task.staleAfterMinutes ?? config.taskStaleDefaultMinutes) * 60 * 1000,
          nextAction: "Awaiting assignee update after chief follow-up",
          chiefAgentId: chief._id,
        });
      }
    } catch (error) {
      console.error("[watchdog] error", error);
      recordRuntimeError("chiefWatchdog", error);
      markLoopHeartbeat("chiefWatchdog", { status: "error" });
    }
    await sleep(config.chiefMonitorIntervalMs);
  }
  markLoopHeartbeat("chiefWatchdog", { status: "stopped" });
}

async function handleReviewTask(task, agents) {
  const reviewer = agents.byName.get(config.reviewerAgentName);
  if (!reviewer) return;
  const taskMessages = await q(api.messages.listByTask, { taskId: task._id });
  const taskDocs = await q(api.documents.list, { taskId: task._id });
  const runs = await q((api).automation.listAutomationRunsByTask, { taskId: task._id });
  const hasEvidence = (taskMessages?.length ?? 0) > 0 || (taskDocs?.length ?? 0) > 0;
  const acceptance = task.acceptanceCriteria ?? [];
  const codingTask = isImplementationTask(task);
  const outputPaths = ensureProjectLocalEvidencePaths(
    task,
    extractAbsolutePathEvidence(taskMessages, taskDocs)
  );
  const hasOutputPathEvidence = outputPaths.length > 0;
  const specialistSucceeded = (runs ?? []).some(
    (r) => r.role === "specialist" && r.dispatchType === "execution" && r.status === "succeeded"
  );

  const prompt =
    `Review Mission Control task ${String(task._id)} (${task.title}).\n` +
    `Acceptance criteria:\n- ${acceptance.join("\n- ") || "No explicit criteria"}\n\n` +
    `Decide pass/fail based on correctness, completeness, and real evidence.`;
  const start = Date.now();
  const result = await runOpenClawAgent({ role: "reviewer", task, prompt, targetAgent: reviewer });
  await m((api).automation.createAutomationRun, {
    taskId: task._id,
    role: "reviewer",
    agentName: reviewer.name,
    dispatchType: "review",
    status: result.code === 0 ? "succeeded" : "failed",
    attempt: 1,
    inputSummary: "Reviewer validation",
    outputSummary: result.code === 0 ? "Reviewer dispatch invoked" : "Reviewer dispatch failed",
    error: result.code === 0 ? undefined : String(result.stderr || result.stdout).slice(0, 500),
    startedAt: start,
    finishedAt: Date.now(),
  });

  let approved = false;
  let summary = "";
  let findings = [];

  if (config.reviewerDefaultDecision === "pass") {
    approved = true;
    summary = "Reviewer auto-approved (configured pass fallback).";
  } else if (config.reviewerDefaultDecision === "fail") {
    approved = false;
    summary = "Reviewer requested changes (configured fail fallback).";
    findings = ["Manual verification required by reviewer configuration."];
  } else {
    approved =
      hasEvidence &&
      acceptance.length > 0 &&
      specialistSucceeded &&
      (!codingTask || hasOutputPathEvidence);
    summary = approved
      ? "Reviewer approved: evidence, acceptance criteria, and execution signals validated."
      : "Reviewer requested changes: insufficient evidence for safe approval.";
    if (!hasEvidence) findings.push("No task comments/documents found as review evidence.");
    if (acceptance.length === 0) findings.push("No acceptance criteria recorded by Chief triage.");
    if (!specialistSucceeded) {
      findings.push("No successful specialist execution run recorded in automation audit.");
    }
    if (codingTask && !hasOutputPathEvidence) {
      findings.push(
        "Implementation/coding task missing explicit output path evidence. Post final output path in comments/docs (e.g., `Output Path: /absolute/path`)."
        + " `Stored Location: /absolute/path` is also accepted."
      );
    }
  }

  await m((api).automation.applyReviewDecision, {
    taskId: task._id,
    reviewerAgentId: reviewer._id,
    reviewerAgentName: reviewer.name,
    approved,
    summary,
    findings,
    fallbackStatus: "in_progress",
  });
}

async function statusNotificationLoop(signal) {
  const seen = new Map();
  markLoopHeartbeat("statusNotifier", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("statusNotifier", { status: "loop" });
      const tasks = await q(api.tasks.list, {});
      const agents = await getAgentMap();
      for (const task of tasks) {
        if (task.source !== "telegram" || !task.sourceRef?.chatId) continue;
        const key = String(task._id);
        const commentCount = Number(task.commentCount ?? 0);
        const attachmentCount = Number(task.attachmentCount ?? 0);
        const fingerprint = JSON.stringify({
          status: task.status,
          reviewStatus: task.reviewStatus,
          assignees: (task.assigneeIds ?? []).map(String),
          nextAction: task.nextAction,
          escalationLevel: task.escalationLevel,
          automationState: task.automationState,
          // Only include evidence counters for completed tasks; otherwise this causes noisy duplicate in_progress updates.
          evidenceVersion:
            task.status === "done" ? `${commentCount}:${attachmentCount}` : undefined,
        });
        const prev = seen.get(key);
        if (prev === undefined) {
          seen.set(key, fingerprint);
          continue;
        }
        if (prev !== fingerprint) {
          const msg = await statusMessageForTask(task, agents.byId);
          try {
            await sendTelegramText(task.sourceRef.chatId, msg);
            await m((api).telegram.logTelegramStatusSent, {
              taskId: task._id,
              target: task.sourceRef.chatId,
              summary: `${task.status}${task.reviewStatus ? `/${task.reviewStatus}` : ""}`,
            });
          } catch (e) {
            console.error("[notify] telegram send failed", e);
          }
          seen.set(key, fingerprint);
        }
      }
    } catch (error) {
      console.error("[notify] error", error);
      recordRuntimeError("statusNotifier", error);
      markLoopHeartbeat("statusNotifier", { status: "error" });
    }
    await sleep(5000);
  }
  markLoopHeartbeat("statusNotifier", { status: "stopped" });
}

async function main() {
  const previousRuntimeState = loadRuntimeState();
  console.log("[orchestrator] starting");
  console.log("[orchestrator] convex:", config.convexUrl);
  console.log("[orchestrator] webhook:", config.telegramWebhookEnabled, config.telegramWebhookPort);
  console.log("[orchestrator] polling:", config.telegramPollingEnabled);
  if (previousRuntimeState?.process?.lastStartedAt) {
    console.log(
      "[orchestrator] resuming with saved state from",
      new Date(previousRuntimeState.process.lastStartedAt).toISOString()
    );
  }

  patchRuntimeState({
    process: {
      pid: process.pid,
      cwd: process.cwd(),
      lastStartedAt: Date.now(),
      running: true,
      node: process.version,
    },
  });

  const abort = new AbortController();
  const onStopSignal = () => {
    patchRuntimeState({
      process: {
        running: false,
        lastStopSignalAt: Date.now(),
      },
    });
    abort.abort();
  };
  process.on("SIGINT", onStopSignal);
  process.on("SIGTERM", onStopSignal);

  startWebhookServer(abort.signal);

  const loops = [
    chiefTriageLoop(abort.signal),
    chiefWatchdogLoop(abort.signal),
    statusNotificationLoop(abort.signal),
  ];
  if (config.telegramPollingEnabled && config.telegramBotToken) {
    loops.push(pollingLoop(abort.signal));
  }

  await Promise.allSettled(loops);
  patchRuntimeState({
    process: {
      running: false,
      lastStoppedAt: Date.now(),
    },
  });
}

main().catch((err) => {
  console.error("[orchestrator] fatal", err);
  recordRuntimeError("main", err);
  patchRuntimeState({
    process: {
      running: false,
      lastCrashedAt: Date.now(),
    },
  });
  process.exitCode = 1;
});
