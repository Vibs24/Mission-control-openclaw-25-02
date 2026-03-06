import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import {
  getWorkflowDefinition,
  resolveWorkflowKind,
  workflowKindFromCommand,
  workflowLabel,
} from "./workflows/registry.mjs";
import {
  buildRelayWorklog,
  buildReviewerPrompt,
  buildSpecialistPrompt,
  inferWorkflowAcceptanceCriteria,
  isStructuredWorklog,
  requiresOutputPathEvidence,
} from "./workflows/templates.mjs";
import { buildParallelExecutionPlan } from "./workflows/parallel-planner.mjs";
import {
  LEGACY_TO_PARALLEL_AGENT_ALIAS,
  PARALLEL_TO_LEGACY_AGENT_ALIAS,
} from "./workflows/role-mapping.mjs";
import { createInternalContextProvider } from "./context-providers.mjs";

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

function resolveOpenClawHome(profile, explicitHome = "") {
  const fromEnv = String(explicitHome || "").trim();
  if (fromEnv) return fromEnv;
  const normalizedProfile = String(profile || "").trim();
  if (!normalizedProfile || normalizedProfile === "default") {
    return path.join(process.env.HOME || "", ".openclaw");
  }
  return path.join(process.env.HOME || "", `.openclaw-${normalizedProfile}`);
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
  telegramDigestEnabled: env.TELEGRAM_DIGEST_ENABLED !== "false",
  telegramDigestIntervalMs: Math.max(
    60 * 1000,
    Number(env.TELEGRAM_DIGEST_INTERVAL_MINUTES || 15) * 60 * 1000
  ),
  telegramDigestLoopIntervalMs: Math.max(
    15 * 1000,
    Number(env.TELEGRAM_DIGEST_LOOP_INTERVAL_SEC || 60) * 1000
  ),
  telegramDigestIncludeDone: env.TELEGRAM_DIGEST_INCLUDE_DONE !== "false",
  telegramDigestDoneLimit: Math.max(0, Number(env.TELEGRAM_DIGEST_DONE_LIMIT || 10)),
  chiefMonitorIntervalMs: Number(env.CHIEF_MONITOR_INTERVAL_SEC || 180) * 1000,
  chiefAgentName: env.CHIEF_AGENT_NAME || "Chief",
  reviewerAgentName: env.REVIEWER_AGENT_NAME || "Reviewer",
  openclawBin: env.OPENCLAW_BIN || "openclaw",
  openclawProfile: env.OPENCLAW_PROFILE || "",
  openclawHome: resolveOpenClawHome(env.OPENCLAW_PROFILE || "", env.OPENCLAW_HOME || ""),
  openclawConfigSyncEnabled: env.OPENCLAW_CONFIG_SYNC_ENABLED !== "false",
  openclawConfigCanonicalHome:
    env.OPENCLAW_CONFIG_CANONICAL_HOME ||
    resolveOpenClawHome(env.OPENCLAW_PROFILE || "", env.OPENCLAW_HOME || ""),
  openclawConfigStrictStartup: env.OPENCLAW_CONFIG_STRICT_STARTUP !== "false",
  openclawModelLockEnabled: env.OPENCLAW_MODEL_LOCK_ENABLED !== "false",
  openclawProviderLock: env.OPENCLAW_PROVIDER_LOCK || "openai-codex",
  openclawModelLockPrefix:
    env.OPENCLAW_MODEL_LOCK_PREFIX ||
    `${env.OPENCLAW_PROVIDER_LOCK || "openai-codex"}/`,
  openclawModelLockExact: env.OPENCLAW_MODEL_LOCK_EXACT || "",
  openclawRuntimeModelHintEnforced: env.OPENCLAW_RUNTIME_MODEL_HINT_ENFORCED !== "false",
  enforceConfiguredModelOnly: env.ENFORCE_CONFIGURED_MODEL_ONLY !== "false",
  openclawModelLockCacheMs: Math.max(
    10 * 1000,
    Number(env.OPENCLAW_MODEL_LOCK_CACHE_SECONDS || 60) * 1000
  ),
  openclawDispatchTimeoutMs: Math.max(
    60 * 1000,
    Number(env.OPENCLAW_DISPATCH_TIMEOUT_SECONDS || 540) * 1000
  ),
  autoTriageEnabled: env.AUTO_TRIAGE_ENABLED !== "false",
  autoDispatchEnabled: env.AUTO_DISPATCH_ENABLED !== "false",
  autoReviewEnabled: env.AUTO_REVIEW_ENABLED !== "false",
  autoSubmitReadyTasksToReview: env.AUTO_SUBMIT_READY_TASKS_TO_REVIEW !== "false",
  autoBlockStaleExecutionEnabled: env.AUTO_BLOCK_STALE_EXECUTION !== "false",
  autoRedispatchStaleExecutionEnabled: env.AUTO_REDISPATCH_STALE_EXECUTION !== "false",
  autoRecoverBlockedTasksEnabled: env.AUTO_RECOVER_BLOCKED_TASKS !== "false",
  blockedRecoveryCooldownMs: Math.max(
    60 * 1000,
    Number(env.BLOCKED_RECOVERY_COOLDOWN_MINUTES || 5) * 60 * 1000
  ),
  blockedRecoveryMaxAttempts: Math.max(1, Number(env.BLOCKED_RECOVERY_MAX_ATTEMPTS || 6)),
  allowAgentFallbackToMain: env.ALLOW_AGENT_FALLBACK_TO_MAIN === "true",
  accountabilityLedgerEnabled: env.ACCOUNTABILITY_LEDGER_ENABLED !== "false",
  accountabilityStrictGate: env.ACCOUNTABILITY_STRICT_GATE !== "false",
  accountabilityStepStaleMinutes: Math.max(1, Number(env.ACCOUNTABILITY_STEP_STALE_MINUTES || 10)),
  taskStaleDefaultMinutes: Number(env.TASK_STALE_DEFAULT_MINUTES || 30),
  maxChiefFollowupsBeforeBlocking: Math.max(1, Number(env.MAX_CHIEF_FOLLOWUPS_BEFORE_BLOCKING || 3)),
  reviewerDefaultDecision: env.REVIEWER_DEFAULT_DECISION || "heuristic",
  outboxReplayEnabled: env.OUTBOX_REPLAY_ENABLED !== "false",
  outboxReplayIntervalMs: Math.max(2000, Number(env.OUTBOX_REPLAY_INTERVAL_SEC || 10) * 1000),
  taskStepStateReconcile: env.TASK_STEP_STATE_RECONCILE !== "false",
  engineeringWorkflowsEnabled: env.ENGINEERING_WORKFLOWS_ENABLED !== "false",
  workflowCommandsEnabled: env.WORKFLOW_COMMANDS_ENABLED !== "false",
  structuredWorklogRequired: env.STRUCTURED_WORKLOG_REQUIRED !== "false",
  workflowUiEnhanced: env.WORKFLOW_UI_ENHANCED !== "false",
  internalContextProviderOnly: env.INTERNAL_CONTEXT_PROVIDER_ONLY !== "false",
  workflowShadowModeEnabled: env.WORKFLOW_SHADOW_MODE_ENABLED === "true",
  workflowShadowModeHours: Math.max(1, Number(env.WORKFLOW_SHADOW_MODE_HOURS || 24)),
  workflowShadowModeStartedAt: env.WORKFLOW_SHADOW_MODE_STARTED_AT || "",
  executionEventsV2Enabled: env.EXECUTION_EVENTS_V2_ENABLED !== "false",
  executionEventsBackfillDays: Math.max(1, Number(env.EXECUTION_EVENTS_BACKFILL_DAYS || 7)),
  executionEventsMirrorToSquadChat:
    env.EXECUTION_EVENTS_MIRROR_TO_SQUAD_CHAT !== "false",
  executionHeartbeatEnabled: env.EXECUTION_HEARTBEAT_ENABLED !== "false",
  executionHeartbeatMinutes: Math.max(1, Number(env.EXECUTION_HEARTBEAT_MINUTES || 2)),
  executionEventMaxDetailsChars: Math.max(2000, Number(env.EXECUTION_EVENT_MAX_DETAILS_CHARS || 12000)),
  implementationQualityGateEnabled: env.IMPLEMENTATION_QUALITY_GATE_ENABLED !== "false",
  implementationQualityMinSourceFiles: Math.max(
    1,
    Number(env.IMPLEMENTATION_QUALITY_MIN_SOURCE_FILES || 2)
  ),
  implementationQualityMinTotalFiles: Math.max(
    1,
    Number(env.IMPLEMENTATION_QUALITY_MIN_TOTAL_FILES || 3)
  ),
  implementationQualityMinSourceFilesSmoke: Math.max(
    0,
    Number(env.IMPLEMENTATION_QUALITY_MIN_SOURCE_FILES_SMOKE || 1)
  ),
  implementationQualityMinTotalFilesSmoke: Math.max(
    1,
    Number(env.IMPLEMENTATION_QUALITY_MIN_TOTAL_FILES_SMOKE || 2)
  ),
  implementationQualityRequireReadme:
    env.IMPLEMENTATION_QUALITY_REQUIRE_README !== "false",
  implementationQualityRequireVerificationForTestTasks:
    env.IMPLEMENTATION_QUALITY_REQUIRE_VERIFICATION_FOR_TEST_TASKS !== "false",
  implementationQualityRequireVerificationForSmokeTasks:
    env.IMPLEMENTATION_QUALITY_REQUIRE_VERIFICATION_FOR_SMOKE_TASKS === "true",
  specialistQualityAutofixEnabled: env.SPECIALIST_QUALITY_AUTOFIX_ENABLED !== "false",
  specialistQualityAutofixMaxAttempts: Math.max(
    0,
    Number(env.SPECIALIST_QUALITY_AUTOFIX_MAX_ATTEMPTS || 1)
  ),
  simpleTaskEnhancementEnabled: env.SIMPLE_TASK_ENHANCEMENT_ENABLED !== "false",
  simpleTaskEnhancementMinTotalFiles: Math.max(
    1,
    Number(env.SIMPLE_TASK_ENHANCEMENT_MIN_TOTAL_FILES || 5)
  ),
  autoTaskArtifactsEnabled: env.AUTO_TASK_ARTIFACTS_ENABLED !== "false",
  taskArtifactsRoot: env.TASK_ARTIFACTS_ROOT || deliverablesRoot,
  taskArtifactMirrorExternal: env.TASK_ARTIFACT_MIRROR_EXTERNAL !== "false",
  hierarchicalPmWorkflowEnabled: env.HIERARCHICAL_PM_WORKFLOW_ENABLED !== "false",
  chiefPmParallelDefault: env.CHIEF_PM_PARALLEL_DEFAULT !== "false",
  pmDependencyAutoInfer: env.PM_DEPENDENCY_AUTO_INFER !== "false",
  pmDependencyOverrideEnabled: env.PM_DEPENDENCY_OVERRIDE_ENABLED !== "false",
  pmCoordinationOnly: env.PM_COORDINATION_ONLY !== "false",
  strictRoleRouting: env.STRICT_ROLE_ROUTING !== "false",
  strictPmAgentRequired: env.STRICT_PM_AGENT_REQUIRED !== "false",
  legacyAgentRoutingEnabled: env.LEGACY_AGENT_ROUTING_ENABLED === "true",
  nodeHeartbeatEnabled: env.NODE_HEARTBEAT_ENABLED !== "false",
  nodeHeartbeatMinutes: Math.max(1, Number(env.NODE_HEARTBEAT_MINUTES || 2)),
  chiefAutoRecoverStaleNode: env.CHIEF_AUTO_RECOVER_STALE_NODE !== "false",
  chiefNodeRetryBudget: Math.max(0, Number(env.CHIEF_NODE_RETRY_BUDGET || 2)),
  stateDir: path.join(__dirname, ".state"),
};

if (!config.convexUrl) {
  throw new Error("Missing MISSION_CONTROL_CONVEX_URL or VITE_CONVEX_URL");
}

fs.mkdirSync(config.stateDir, { recursive: true });
fs.mkdirSync(deliverablesRoot, { recursive: true });
fs.mkdirSync(config.taskArtifactsRoot, { recursive: true });
const offsetFile = path.join(config.stateDir, "telegram-offset.json");
const runtimeStateFile = path.join(config.stateDir, "runtime-state.json");
const outboxFile = path.join(config.stateDir, "outbox.json");
const invalidChatsFile = path.join(config.stateDir, "invalid-chats.json");
const workflowShadowStartFile = path.join(config.stateDir, "workflow-shadow-start.txt");

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readTextFile(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    if (String(error?.code || "") === "ENOENT") {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        // ignore cleanup failure
      }
      return;
    }
    throw error;
  }
}

let runtimeState = {
  version: 1,
  process: {},
  telegram: {},
  loops: {},
  blockedRecovery: {},
  startupPreflight: {},
  degraded: false,
  degradedSince: null,
  lastReplayAt: null,
  outboxSize: 0,
  lastError: null,
};
let artifactPathPersistenceUnsupported = false;
let artifactVerificationPersistenceUnsupported = false;
let lastGatewayRestartAt = 0;
let openclawWorkspaceProbeComplete = false;
let openclawWorkspaceRootCache = null;
let executionEventsUnavailable = false;
let openclawModelLockCache = {
  checkedAt: 0,
  ok: false,
  primaryModel: "",
  reason: "",
  providerKey: "",
  baseUrl: "",
  authProfileKey: "",
  configPath: "",
};
const lastExecutionHeartbeatByStep = new Map();
const pmNodeDispatchInFlight = new Set();
const executionActorEmojiCache = new Map();

function defaultEmojiForActorRole(role = "") {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "chief") return "👑";
  if (normalized === "project_manager") return "📋";
  if (normalized === "reviewer") return "✅";
  if (normalized === "specialist") return "💻";
  return "📌";
}

async function resolveExecutionActorEmoji(actorAgentId, actorRole) {
  if (actorAgentId) {
    const cacheKey = String(actorAgentId);
    if (executionActorEmojiCache.has(cacheKey)) {
      return executionActorEmojiCache.get(cacheKey);
    }
    try {
      const agent = await q(api.agents.get, { id: actorAgentId });
      const emoji = String(agent?.emoji || "").trim() || defaultEmojiForActorRole(actorRole);
      executionActorEmojiCache.set(cacheKey, emoji);
      return emoji;
    } catch {
      // ignore and use role fallback
    }
  }
  return defaultEmojiForActorRole(actorRole);
}

function buildSquadChatMirrorContent({
  summary = "",
  workDone = "",
  workingNow = "",
  nextSteps = "",
  blockers = "",
  evidencePaths = [],
}) {
  const lines = [];
  if (summary) lines.push(String(summary).trim());
  if (workDone) lines.push(`Done: ${String(workDone).trim()}`);
  if (workingNow) lines.push(`Doing: ${String(workingNow).trim()}`);
  if (nextSteps) lines.push(`Next: ${String(nextSteps).trim()}`);
  if (blockers) lines.push(`Blockers: ${String(blockers).trim()}`);
  if ((evidencePaths?.length ?? 0) > 0) {
    lines.push(`Evidence: ${(evidencePaths || []).slice(0, 2).join(" | ")}`);
  }
  const text = lines.filter(Boolean).join("\n").trim();
  return text.slice(0, 1900);
}

function extractRuntimeModelHints(text = "") {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  const found = new Set();
  const patterns = [
    /using model\s*:?\s*([a-z0-9._/-]+)/gi,
    /model\s*=\s*([a-z0-9._/-]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      const candidate = String(match?.[1] || "")
        .trim()
        .replace(/^['"`]+|['"`]+$/g, "");
      if (!candidate) continue;
      found.add(candidate);
    }
  }
  return [...found];
}

function getOpenClawModelLockStatus({ force = false } = {}) {
  if (!config.openclawModelLockEnabled) {
    return {
      ok: true,
      disabled: true,
      primaryModel: "",
      reason: "",
      providerKey: String(config.openclawProviderLock || "").trim(),
      baseUrl: "",
      authProfileKey: "",
      configPath: path.join(config.openclawHome || "", "openclaw.json"),
    };
  }
  const now = Date.now();
  if (
    !force &&
    openclawModelLockCache.checkedAt > 0 &&
    now - openclawModelLockCache.checkedAt < config.openclawModelLockCacheMs
  ) {
    return {
      ok: openclawModelLockCache.ok,
      primaryModel: openclawModelLockCache.primaryModel,
      reason: openclawModelLockCache.reason,
      providerKey: openclawModelLockCache.providerKey,
      baseUrl: openclawModelLockCache.baseUrl,
      authProfileKey: openclawModelLockCache.authProfileKey,
      configPath: openclawModelLockCache.configPath,
      cached: true,
    };
  }

  let ok = false;
  let primaryModel = "";
  let reason = "";
  let providerKey = "";
  let baseUrl = "";
  let authProfileKey = "";
  const configPath = path.join(config.openclawHome || "", "openclaw.json");
  try {
    const profileJson = readJsonFile(configPath, null);
    if (!profileJson || typeof profileJson !== "object") {
      reason = `missing_or_invalid_profile_config:${configPath}`;
    } else {
      primaryModel = String(profileJson?.agents?.defaults?.model?.primary || "").trim();
      providerKey = String(primaryModel.split("/")[0] || "").trim();
      const expectedProvider = String(config.openclawProviderLock || "").trim();
      const expectedPrefix = String(config.openclawModelLockPrefix || "").trim();
      const expectedExact = String(config.openclawModelLockExact || "").trim();
      const providerConfig = profileJson?.models?.providers?.[expectedProvider];
      authProfileKey = `${expectedProvider}:default`;
      const authProfile = profileJson?.auth?.profiles?.[authProfileKey];
      baseUrl = String(providerConfig?.baseUrl || "").trim();

      if (!primaryModel) {
        reason = "missing_primary_model";
      } else if (expectedExact && primaryModel !== expectedExact) {
        reason = `model_exact_mismatch:${primaryModel}`;
      } else if (expectedPrefix && !primaryModel.startsWith(expectedPrefix)) {
        reason = `model_prefix_mismatch:${primaryModel}`;
      } else if (expectedProvider && providerKey !== expectedProvider) {
        reason = `provider_mismatch:${providerKey}`;
      } else if (!/\/gpt[-0-9.]/i.test(primaryModel)) {
        reason = `non_gpt_model:${primaryModel}`;
      } else if (!providerConfig) {
        reason = `missing_provider_config:${expectedProvider}`;
      } else if (!baseUrl) {
        reason = `missing_provider_baseurl:${expectedProvider}`;
      } else if (!authProfile) {
        reason = `missing_auth_profile:${authProfileKey}`;
      } else {
        ok = true;
      }
    }
  } catch (error) {
    reason = `model_lock_check_error:${String(error?.message || error)}`;
  }

  openclawModelLockCache = {
    checkedAt: now,
    ok,
    primaryModel,
    reason,
    providerKey,
    baseUrl,
    authProfileKey,
    configPath,
  };

  return {
    ok,
    primaryModel,
    reason,
    providerKey,
    baseUrl,
    authProfileKey,
    configPath,
    cached: false,
  };
}

function isRuntimeModelHintAllowed(hint = "") {
  const normalizedHint = String(hint || "").trim().toLowerCase();
  if (!normalizedHint) return false;

  const expectedProvider = String(config.openclawProviderLock || "").trim().toLowerCase();
  const expectedPrefix = String(config.openclawModelLockPrefix || "").trim().toLowerCase();
  const configuredPrimary = String(openclawModelLockCache?.primaryModel || "").trim().toLowerCase();
  const expectedExact = String(config.openclawModelLockExact || "").trim().toLowerCase();
  const enforcedExact = expectedExact || configuredPrimary;
  const expectedModelId = enforcedExact.includes("/")
    ? enforcedExact.split("/").slice(1).join("/")
    : enforcedExact;

  if (enforcedExact) {
    if (normalizedHint === enforcedExact) return true;
    if (expectedModelId && normalizedHint === expectedModelId) return true;
    return false;
  }
  if (expectedPrefix && normalizedHint.startsWith(expectedPrefix)) return true;
  if (expectedProvider && normalizedHint.startsWith(`${expectedProvider}/`)) return true;
  return /gpt[-0-9.]/i.test(normalizedHint);
}

function enforceDispatchResultModelHints(result = {}) {
  if (!config.openclawModelLockEnabled || !config.openclawRuntimeModelHintEnforced) {
    return result;
  }
  const combined = `${String(result?.stderr || "")}\n${String(result?.stdout || "")}`;
  const hints = extractRuntimeModelHints(combined);
  if (hints.length === 0) return result;

  const hasAllowed = hints.some((hint) => isRuntimeModelHintAllowed(hint));
  if (hasAllowed) return result;

  const expected = String(config.openclawModelLockExact || config.openclawModelLockPrefix || "configured OpenAI GPT model");
  const nextCode = Number(result?.code ?? 1) === 0 ? 1 : Number(result?.code ?? 1);
  return {
    ...result,
    code: nextCode,
    stderr:
      `[model-lock] runtime model hint mismatch: expected ${expected}; observed: ${hints.join(", ")}.\n` +
      String(result?.stderr || ""),
  };
}

function loadRuntimeState() {
  const loaded = readJsonFile(runtimeStateFile, null);
  if (loaded && typeof loaded === "object") {
    runtimeState = {
      version: 1,
      process: loaded.process || {},
      telegram: loaded.telegram || {},
      loops: loaded.loops || {},
      blockedRecovery: loaded.blockedRecovery || {},
      startupPreflight: loaded.startupPreflight || {},
      degraded: Boolean(loaded.degraded),
      degradedSince: loaded.degradedSince ?? null,
      lastReplayAt: loaded.lastReplayAt ?? null,
      outboxSize: Number(loaded.outboxSize ?? 0),
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
    blockedRecovery: {
      ...(runtimeState.blockedRecovery || {}),
      ...(patch.blockedRecovery || {}),
    },
  };
  persistRuntimeState();
}

function resolveWorkflowShadowStartMs() {
  if (!config.workflowShadowModeEnabled) return null;
  const envMs = Date.parse(config.workflowShadowModeStartedAt || "");
  if (Number.isFinite(envMs) && envMs > 0) return envMs;

  const persistedRaw = readTextFile(workflowShadowStartFile, "").trim();
  const persistedMs = Number(persistedRaw);
  if (Number.isFinite(persistedMs) && persistedMs > 0) return persistedMs;

  const now = Date.now();
  fs.writeFileSync(workflowShadowStartFile, `${now}\n`);
  return now;
}

const workflowShadowStartMs = resolveWorkflowShadowStartMs();

function isWorkflowShadowModeActive() {
  if (!config.workflowShadowModeEnabled) return false;
  if (!workflowShadowStartMs) return true;
  const elapsedMs = Date.now() - workflowShadowStartMs;
  return elapsedMs < config.workflowShadowModeHours * 60 * 60 * 1000;
}

function isStrictAccountabilityGateEnabled() {
  return config.accountabilityStrictGate && !isWorkflowShadowModeActive();
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

function stableFingerprint(text = "") {
  return crypto.createHash("sha1").update(String(text)).digest("hex").slice(0, 12);
}

const TELEGRAM_SECTION_ORDER = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "waiting",
  "blocked",
  "done",
];

const TELEGRAM_SECTION_LABEL = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
};

function currentDigestMap() {
  const map = runtimeState?.telegram?.digestByChat;
  return map && typeof map === "object" ? map : {};
}

function digestStateForChat(chatId) {
  return currentDigestMap()[String(chatId)] || {
    lastSentAt: 0,
    lastFingerprint: "",
  };
}

function updateDigestStateForChat(chatId, patch = {}) {
  const key = String(chatId);
  const current = currentDigestMap();
  const next = {
    ...current,
    [key]: {
      ...digestStateForChat(key),
      ...patch,
    },
  };
  patchRuntimeState({
    telegram: {
      digestByChat: next,
      lastDigestAt: Date.now(),
    },
  });
}

function blockedRecoveryMap() {
  const map = runtimeState?.blockedRecovery;
  return map && typeof map === "object" ? map : {};
}

function blockedRecoveryState(taskId) {
  return blockedRecoveryMap()[String(taskId)] || {
    attempts: 0,
    lastAttemptAt: 0,
    lastReasonCode: "",
    lastOutcome: "",
  };
}

function updateBlockedRecoveryState(taskId, patch = {}) {
  const key = String(taskId);
  const current = blockedRecoveryMap();
  const next = {
    ...current,
    [key]: {
      ...blockedRecoveryState(key),
      ...patch,
    },
  };
  patchRuntimeState({
    blockedRecovery: next,
  });
}

function clearBlockedRecoveryState(taskId) {
  const key = String(taskId);
  const current = { ...blockedRecoveryMap() };
  if (!current[key]) return;
  delete current[key];
  patchRuntimeState({
    blockedRecovery: current,
  });
}

function pruneBlockedRecoveryState(validTaskIds = new Set()) {
  const current = { ...blockedRecoveryMap() };
  let changed = false;
  for (const taskId of Object.keys(current)) {
    if (!validTaskIds.has(String(taskId))) {
      delete current[taskId];
      changed = true;
    }
  }
  if (!changed) return;
  patchRuntimeState({
    blockedRecovery: current,
  });
}

function loadOutbox() {
  return readJsonFile(outboxFile, { version: 1, items: [] });
}

function persistOutbox(state) {
  writeJsonAtomic(outboxFile, {
    version: 1,
    items: Array.isArray(state?.items) ? state.items : [],
  });
  patchRuntimeState({
    outboxSize: Array.isArray(state?.items) ? state.items.length : 0,
  });
}

function loadInvalidChats() {
  return readJsonFile(invalidChatsFile, { version: 1, disabled: {} });
}

function persistInvalidChats(state) {
  writeJsonAtomic(invalidChatsFile, {
    version: 1,
    disabled: state?.disabled || {},
  });
}

let invalidChatState = loadInvalidChats();

function markDegraded(message = "") {
  patchRuntimeState({
    degraded: true,
    degradedSince: runtimeState.degradedSince || Date.now(),
    lastError: {
      scope: "degraded",
      at: Date.now(),
      message: String(message || "Mission Control degraded mode").slice(0, 1000),
    },
  });
}

function clearDegradedIfHealthy() {
  if (!runtimeState.degraded) return;
  const outbox = loadOutbox();
  if ((outbox.items || []).length > 0) return;
  patchRuntimeState({
    degraded: false,
    degradedSince: null,
  });
}

function classifyTelegramFailure(error) {
  const msg = String(error?.message || error || "");
  if (/chat not found/i.test(msg)) return "chat_not_found";
  if (/forbidden/i.test(msg) || /bot was blocked/i.test(msg)) return "chat_forbidden";
  if (/too many requests/i.test(msg)) return "rate_limited";
  if (/timed out|timeout|enotfound|econnreset|fetch failed/i.test(msg)) return "transient";
  return "unknown";
}

function isPermanentTelegramFailure(kind) {
  return kind === "chat_not_found" || kind === "chat_forbidden";
}

function isChatDisabled(chatId) {
  return Boolean(invalidChatState?.disabled?.[String(chatId)]);
}

function disableChat(chatId, reason, taskId) {
  const key = String(chatId);
  if (!invalidChatState.disabled) invalidChatState.disabled = {};
  if (invalidChatState.disabled[key]) return false;
  invalidChatState.disabled[key] = {
    reason,
    taskId: taskId ? String(taskId) : null,
    at: Date.now(),
  };
  persistInvalidChats(invalidChatState);
  return true;
}

function enableChat(chatId) {
  const key = String(chatId);
  if (!invalidChatState.disabled?.[key]) return false;
  delete invalidChatState.disabled[key];
  persistInvalidChats(invalidChatState);
  return true;
}

function queueOutboxEvent(item) {
  const now = Date.now();
  const outbox = loadOutbox();
  const dedupeKey = String(item?.dedupeKey || "");
  if (dedupeKey && outbox.items.some((entry) => entry.dedupeKey === dedupeKey)) {
    return false;
  }
  outbox.items.push({
    id: crypto.randomUUID(),
    type: item.type,
    eventType: item.eventType || item.type || "status_notification",
    taskId: item.taskId ? String(item.taskId) : null,
    chatId: String(item.chatId),
    text: String(item.text || ""),
    replyToMessageId: item.replyToMessageId ?? null,
    dedupeKey,
    attempt: 0,
    nextAttemptAt: now,
    createdAt: now,
    lastError: null,
  });
  persistOutbox(outbox);
  markDegraded(`queued_outbox:${item.eventType || item.type || "event"}`);
  return true;
}

function removeOutboxItem(outbox, id) {
  outbox.items = outbox.items.filter((entry) => entry.id !== id);
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
      const result = await fn();
      clearDegradedIfHealthy();
      return result;
    } catch (error) {
      lastErr = error;
      if (!isTransientInfraError(error) || attempt >= maxAttempts) {
        markDegraded(`${label}:${String(error?.message || error)}`);
        throw error;
      }
      const delayMs = Math.min(4000, 250 * 2 ** (attempt - 1));
      console.warn(`[retry] ${label} transient failure (attempt ${attempt}/${maxAttempts}): ${String(error?.message || error)}`);
      markDegraded(`${label}:transient_failure`);
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

function clipText(value, max = 600) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function toEventSummary(value, fallback = "") {
  return clipText(value, 240) || fallback || "Execution event";
}

function normalizeEvidencePaths(paths = []) {
  const seen = new Set();
  const out = [];
  for (const item of paths || []) {
    const raw = String(item || "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function parseStructuredWorklogSections(text = "") {
  const body = String(text || "");
  const sectionKeys = new Set([
    "objective",
    "actions taken",
    "findings",
    "evidence",
    "blockers",
    "next handoff",
  ]);
  const sections = {
    objective: "",
    actionsTaken: "",
    findings: "",
    evidence: "",
    blockers: "",
    nextHandoff: "",
  };
  let current = "";
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z ]+)\s*:\s*(.*)$/);
    if (match) {
      const rawKey = String(match[1] || "").trim().toLowerCase();
      if (sectionKeys.has(rawKey)) {
        current = rawKey;
        const initial = String(match[2] || "").trim();
        if (rawKey === "objective") sections.objective = initial;
        if (rawKey === "actions taken") sections.actionsTaken = initial;
        if (rawKey === "findings") sections.findings = initial;
        if (rawKey === "evidence") sections.evidence = initial;
        if (rawKey === "blockers") sections.blockers = initial;
        if (rawKey === "next handoff") sections.nextHandoff = initial;
        continue;
      }
    }
    if (!current) continue;
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    if (current === "objective") {
      sections.objective = [sections.objective, trimmed].filter(Boolean).join("\n");
    } else if (current === "actions taken") {
      sections.actionsTaken = [sections.actionsTaken, trimmed].filter(Boolean).join("\n");
    } else if (current === "findings") {
      sections.findings = [sections.findings, trimmed].filter(Boolean).join("\n");
    } else if (current === "evidence") {
      sections.evidence = [sections.evidence, trimmed].filter(Boolean).join("\n");
    } else if (current === "blockers") {
      sections.blockers = [sections.blockers, trimmed].filter(Boolean).join("\n");
    } else if (current === "next handoff") {
      sections.nextHandoff = [sections.nextHandoff, trimmed].filter(Boolean).join("\n");
    }
  }
  return sections;
}

function buildExecutionDetailsMarkdown({
  title,
  summary,
  workDone,
  workingNow,
  nextSteps,
  blockers,
  evidencePaths = [],
  detailsMarkdown = "",
}) {
  const parts = [];
  if (title) parts.push(`### ${title}`);
  if (summary) parts.push(String(summary).trim());
  if (workDone) parts.push(`#### Work Done\n${String(workDone).trim()}`);
  if (workingNow) parts.push(`#### Working Now\n${String(workingNow).trim()}`);
  if (nextSteps) parts.push(`#### Next Steps\n${String(nextSteps).trim()}`);
  if (blockers) parts.push(`#### Blockers\n${String(blockers).trim()}`);
  const normalizedPaths = normalizeEvidencePaths(evidencePaths);
  if (normalizedPaths.length > 0) {
    parts.push(`#### Evidence\n${normalizedPaths.map((p) => `- ${p}`).join("\n")}`);
  }
  if (detailsMarkdown) {
    parts.push(`#### Full Context\n${String(detailsMarkdown).trim()}`);
  }
  return parts.join("\n\n").trim();
}

async function emitExecutionEvent({
  taskId,
  actorAgentId,
  actorName,
  actorRole = "system",
  kind = "system",
  severity = "info",
  title = "",
  summary = "",
  workDone = "",
  workingNow = "",
  nextSteps = "",
  blockers = "",
  evidencePaths = [],
  detailsMarkdown = "",
  detailsJson,
  relatedMessageId,
  relatedStepId,
  relatedRunId,
  createdAt,
}) {
  if (!config.executionEventsV2Enabled || executionEventsUnavailable) return null;

  const normalizedActorName = String(actorName || "").trim() || "System";
  const normalizedTitle = clipText(title || summary || "Execution event", 180);
  const normalizedSummary = toEventSummary(summary || title, "Execution event");
  const normalizedEvidencePaths = normalizeEvidencePaths(evidencePaths);

  let markdown = buildExecutionDetailsMarkdown({
    title: normalizedTitle,
    summary: normalizedSummary,
    workDone,
    workingNow,
    nextSteps,
    blockers,
    evidencePaths: normalizedEvidencePaths,
    detailsMarkdown,
  });
  let overflowDocumentId;
  if (markdown.length > config.executionEventMaxDetailsChars) {
    const fullContextMarkdown = markdown;
    if (taskId) {
      try {
        overflowDocumentId = await m((api).documents.create, {
          title: `Execution Context — ${normalizedTitle}`.slice(0, 120),
          content: fullContextMarkdown,
          type: "research",
          taskId,
          createdById: actorAgentId,
          createdByName: normalizedActorName,
          isPinned: false,
        });
        try {
          const taskForMirror = await q((api).tasks.get, { id: taskId });
          if (taskForMirror) {
            mirrorTaskDocumentsToArtifactRoot(taskForMirror, [
              {
                _id: overflowDocumentId,
                title: `Execution Context — ${normalizedTitle}`.slice(0, 120),
                content: fullContextMarkdown,
                type: "research",
                _creationTime: Date.now(),
                createdByName: normalizedActorName,
              },
            ]);
          }
        } catch (mirrorError) {
          console.warn(
            `[deliverables] failed to mirror overflow execution context document for task ${String(
              taskId
            )}: ${String(mirrorError?.message || mirrorError || "")}`
          );
        }
      } catch (error) {
        console.warn(
          `[execution-events] failed to persist overflow document: ${String(
            error?.message || error || ""
          )}`
        );
      }
    }
    markdown = `${markdown.slice(0, config.executionEventMaxDetailsChars).trimEnd()}\n\n`;
    markdown += overflowDocumentId
      ? `_Context truncated in event preview. Full context saved in task document ${String(
          overflowDocumentId
        )}._`
      : "_Context truncated to configured execution event size limit._";
  }
  const mergedDetailsJson =
    detailsJson && typeof detailsJson === "object" && !Array.isArray(detailsJson)
      ? { ...detailsJson }
      : detailsJson !== undefined
        ? { rawDetails: detailsJson }
        : {};
  if (overflowDocumentId) {
    mergedDetailsJson.overflowDocumentId = overflowDocumentId;
  }

  try {
    const eventId = await m((api).executionEvents.create, {
      taskId,
      actorAgentId,
      actorName: normalizedActorName,
      actorRole,
      kind,
      severity,
      title: normalizedTitle,
      summary: normalizedSummary,
      workDone: clipText(workDone, 1200) || undefined,
      workingNow: clipText(workingNow, 1200) || undefined,
      nextSteps: clipText(nextSteps, 1200) || undefined,
      blockers: clipText(blockers, 1200) || undefined,
      evidencePaths: normalizedEvidencePaths.length > 0 ? normalizedEvidencePaths : undefined,
      detailsMarkdown: markdown || undefined,
      detailsJson: Object.keys(mergedDetailsJson).length > 0 ? mergedDetailsJson : undefined,
      relatedMessageId,
      relatedStepId,
      relatedRunId,
      createdAt,
    });
    if (config.executionEventsMirrorToSquadChat && taskId) {
      const chatChannel = `task:${String(taskId)}`;
      const emoji = await resolveExecutionActorEmoji(actorAgentId, actorRole);
      const chatContent = buildSquadChatMirrorContent({
        summary: normalizedSummary,
        workDone,
        workingNow,
        nextSteps,
        blockers,
        evidencePaths: normalizedEvidencePaths,
      });
      if (chatContent) {
        try {
          await m((api).chat.send, {
            fromAgentId: actorAgentId,
            fromName: normalizedActorName,
            fromEmoji: emoji,
            content: chatContent,
            channel: chatChannel,
          });
        } catch (chatError) {
          console.warn(
            `[squad-chat] failed to mirror execution event to ${chatChannel}: ${String(
              chatError?.message || chatError || ""
            )}`
          );
        }
      }
    }
    return eventId;
  } catch (error) {
    const message = String(error?.message || error || "");
    if (
      /Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(
        message
      )
    ) {
      executionEventsUnavailable = true;
      console.warn("[execution-events] create unavailable on deployment; disabling emitter");
      return null;
    }
    console.warn(`[execution-events] failed to write event: ${message}`);
    return null;
  }
}

function heartbeatKey(taskId, step) {
  return `${String(taskId)}:${Number(step?.stepIndex ?? 0)}:${String(step?.agentId || step?.agentName || "unknown")}`;
}

async function maybeEmitRunningStepHeartbeat(task, step, assignee) {
  if (!config.executionEventsV2Enabled || !config.executionHeartbeatEnabled || !step) return;
  const key = heartbeatKey(task?._id, step);
  const now = Date.now();
  const last = Number(lastExecutionHeartbeatByStep.get(key) || 0);
  const intervalMs = Math.max(30 * 1000, config.executionHeartbeatMinutes * 60 * 1000);
  if (now - last < intervalMs) return;

  const startedAt = Number(step?.startedAt ?? 0);
  const lastProgressAt = Number(step?.lastProgressAt ?? startedAt ?? now);
  const staleForMinutes = Math.max(0, Math.floor((now - lastProgressAt) / 60000));
  const severity =
    staleForMinutes >= config.accountabilityStepStaleMinutes ? "warning" : "info";

  await emitExecutionEvent({
    taskId: task?._id,
    actorAgentId: assignee?._id ?? step?.agentId,
    actorName: assignee?.name || step?.agentName || "Assignee",
    actorRole: step?.role === "reviewer" ? "reviewer" : "specialist",
    kind: "heartbeat",
    severity,
    title: `${assignee?.name || step?.agentName || "Assignee"} heartbeat`,
    summary: `Step #${Number(step?.stepIndex ?? 0)} ${String(step?.status || "running")} (${staleForMinutes}m since progress update)`,
    workDone: startedAt > 0 ? `Step started ${Math.max(0, Math.floor((now - startedAt) / 60000))}m ago.` : "",
    workingNow: String(task?.nextAction || "Execution in progress"),
    nextSteps: "Continue execution and post milestone evidence.",
    blockers: String(step?.stuckReason || ""),
    evidencePaths: normalizeEvidencePaths(step?.proofPaths || []),
    detailsJson: {
      stepIndex: Number(step?.stepIndex ?? 0),
      status: String(step?.status || "running"),
      lastProgressAt,
      staleForMinutes,
    },
  });
  lastExecutionHeartbeatByStep.set(key, now);
}

const internalContextProvider = createInternalContextProvider({ q, api });

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
  if (/^\/enablechat\b/i.test(text)) return { parsedAs: "command", createTask: false, command: "enablechat" };
  if (config.workflowCommandsEnabled) {
    const workflowMatch = text.match(/^\/(review|debug|incident|architecture|standup|deploy-checklist)\b/i);
    if (workflowMatch) {
      const cmd = `/${String(workflowMatch[1]).toLowerCase()}`;
      const payload = text.replace(new RegExp(`^\\/${workflowMatch[1]}\\b`, "i"), "").trim();
      if (!payload) {
        return {
          parsedAs: "command",
          createTask: false,
          command: "workflow_empty",
          workflowCommand: cmd,
        };
      }
      return {
        parsedAs: "task",
        createTask: true,
        text: payload,
        workflowCommand: cmd,
      };
    }
  }
  if (/^\/task\b/i.test(text)) {
    const payload = text.replace(/^\/task\b/i, "").trim();
    return {
      parsedAs: payload ? "task" : "command",
      createTask: Boolean(payload),
      text: payload || text,
      command: payload ? undefined : "task_empty",
      workflowCommand: "/task",
    };
  }
  if (String(message.chat.id) === String(config.telegramIntakeChatId)) {
    return { parsedAs: "task", createTask: true, text };
  }
  return { parsedAs: "ignored", createTask: false, reason: "plain_text_non_intake_chat" };
}

async function sendTelegramText(chatId, text, replyToMessageId, meta = {}) {
  const target = String(chatId);
  if (isChatDisabled(target)) {
    return { skipped: true, reason: "chat_disabled", chatId: target };
  }
  const payload = {
    chat_id: target,
    text,
    reply_to_message_id: replyToMessageId,
    disable_web_page_preview: true,
  };
  try {
    const sent = await telegramApi("sendMessage", payload);
    if (meta.taskId) {
      try {
        await m((api).telegram.setTaskTelegramDeliveryState, {
          taskId: meta.taskId,
          state: "ok",
        });
      } catch (error) {
        console.error("[telegram] failed to mark delivery state ok", error);
      }
    }
    clearDegradedIfHealthy();
    return sent;
  } catch (error) {
    const kind = classifyTelegramFailure(error);
    if (isPermanentTelegramFailure(kind)) {
      const firstDisable = disableChat(target, kind, meta.taskId);
      if (firstDisable && meta.taskId) {
        try {
          await m((api).telegram.setTaskTelegramDeliveryState, {
            taskId: meta.taskId,
            state: "disabled_chat",
            reason: kind,
          });
          const task = await q(api.tasks.get, { id: meta.taskId });
          if (task) {
            await m((api).activities.create, {
              type: "automation_error",
              taskId: task._id,
              taskTitle: task.title,
              agentName: config.chiefAgentName,
              message:
                `Telegram delivery disabled for chat ${target}: ${kind}. ` +
                `Use /enablechat ${target} after correcting Telegram chat access.`,
              metadata: { chatId: target, reason: kind },
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromName: config.chiefAgentName,
              content:
                `Chief alert: Telegram delivery is disabled for chat ${target} (${kind}). ` +
                `Fix chat access and run \`/enablechat ${target}\` to resume notifications.`,
            });
          }
        } catch (innerError) {
          console.error("[telegram] failed to log disabled chat", innerError);
        }
      }
      throw error;
    }
    if (config.outboxReplayEnabled && meta.allowQueue !== false) {
      if (meta.taskId) {
        try {
          await m((api).telegram.setTaskTelegramDeliveryState, {
            taskId: meta.taskId,
            state: "transient_failure",
            reason: kind,
          });
        } catch (stateError) {
          console.error("[telegram] failed to mark transient delivery state", stateError);
        }
      }
      const fingerprintSource = meta.fingerprint || `${target}:${text}`;
      const dedupeKey =
        meta.dedupeKey ||
        `${String(meta.taskId || "na")}:${String(meta.eventType || "status")}:${stableFingerprint(
          fingerprintSource
        )}`;
      queueOutboxEvent({
        type: "telegram_send",
        eventType: meta.eventType || "status_notification",
        taskId: meta.taskId,
        chatId: target,
        text,
        replyToMessageId,
        dedupeKey,
      });
      if (meta.throwOnQueue === true) {
        markDegraded(`telegram_send_failed:${kind}`);
        throw error;
      }
      return { queued: true, reason: kind, chatId: target };
    }
    markDegraded(`telegram_send_failed:${kind}`);
    throw error;
  }
}

async function statusMessageForTask(task, agentsById = new Map()) {
  const assigneeIds = (task.assigneeIds ?? []).map(String);
  const assigneeNames = new Set(
    (task.assigneeIds ?? [])
      .map((id) => String(agentsById.get(String(id))?.name || "").toLowerCase())
      .filter(Boolean)
  );
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
      const canonicalPath = resolveTaskArtifactRoot(task);
      if (canonicalPath) {
        const exists = fs.existsSync(canonicalPath);
        const hasArtifacts = exists ? pathHasVerifiableArtifact(canonicalPath) : false;
        if (hasArtifacts) {
          completionBits = [
            "Confirmation: Task completed and approved.",
            `Stored Location: ${canonicalPath}`,
          ];
        } else {
          completionBits = [
            "Confirmation: Task completed and approved.",
            `Stored Location: ${canonicalPath}`,
            exists
              ? "Artifact status: artifact_folder_empty: canonical artifact folder exists but has no verifiable deliverables."
              : "Artifact status: artifact_path_not_found: canonical artifact folder path does not exist on disk.",
          ];
        }
      }

      const [taskMessages, taskDocs] = await Promise.all([
        q(api.messages.listByTask, { taskId: task._id }),
        q(api.documents.list, { taskId: task._id }),
      ]);
      const assigneeMessages = (taskMessages ?? []).filter((msg) => {
        const fromName = String(msg?.fromName || "").toLowerCase();
        const fromAgentId = String(msg?.fromAgentId || "");
        return assigneeNames.has(fromName) || assigneeIds.includes(fromAgentId);
      });
      const assigneeDocs = (taskDocs ?? []).filter((doc) => {
        const createdBy = String(doc?.createdBy || "");
        return createdBy && assigneeIds.includes(createdBy);
      });
      const outputPaths = ensureProjectLocalEvidencePaths(
        task,
        extractAbsolutePathEvidence(assigneeMessages, assigneeDocs)
      );
      if (completionBits.length === 0 && outputPaths.length > 0) {
        completionBits = [
          "Confirmation: Task completed and approved.",
          ...outputPaths.slice(0, 5).map((p, i) =>
            outputPaths.length === 1 ? `Stored Location: ${p}` : `Stored Location ${i + 1}: ${p}`
          ),
        ];
      } else if (completionBits.length === 0) {
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
    `Workflow: ${resolveTaskWorkflowKind(task)}`,
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

function normalizedTaskTitle(task) {
  return String(task?.title || "Untitled task").replace(/\s+/g, " ").trim();
}

function groupTasksBySection(tasks = []) {
  const grouped = Object.fromEntries(TELEGRAM_SECTION_ORDER.map((key) => [key, []]));
  const sorted = [...(tasks || [])].sort(
    (a, b) => Number(b?._creationTime ?? 0) - Number(a?._creationTime ?? 0)
  );
  for (const task of sorted) {
    const status = String(task?.status || "");
    if (!TELEGRAM_SECTION_ORDER.includes(status)) continue;
    if (status === "done" && !config.telegramDigestIncludeDone) continue;
    grouped[status].push(task);
  }
  if (config.telegramDigestDoneLimit >= 0) {
    grouped.done = grouped.done.slice(0, config.telegramDigestDoneLimit);
  }
  return grouped;
}

function staleRunningStep(steps = []) {
  const now = Date.now();
  const staleMs = config.accountabilityStepStaleMinutes * 60 * 1000;
  const running = (steps || []).find((s) => String(s?.status) === "running");
  if (!running) return null;
  const lastAt = Number(running.lastProgressAt ?? running.startedAt ?? running._creationTime ?? 0);
  if (!Number.isFinite(lastAt) || now - lastAt < staleMs) return null;
  return {
    step: running,
    staleForMinutes: Math.max(1, Math.floor((now - lastAt) / 60000)),
  };
}

function buildBlockedOrStuckReason(task, steps = []) {
  const blockedStep = (steps || []).find(
    (s) => String(s?.status) === "blocked" || String(s?.status) === "failed"
  );
  const stale = staleRunningStep(steps);

  if (String(task?.status || "") === "blocked" || blockedStep) {
    const reason =
      String(blockedStep?.stuckReason || "").trim() ||
      String(task?.nextAction || "").trim() ||
      "Blocked reason not recorded.";
    return {
      state: "BLOCKED",
      reason,
    };
  }

  if (stale) {
    const step = stale.step;
    const reason =
      String(step?.stuckReason || "").trim() ||
      `no specialist progress for ${stale.staleForMinutes}m (step ${Number(step?.stepIndex ?? 0)}, ${String(
        step?.agentName || "unknown"
      )})`;
    return {
      state: "STUCK",
      reason,
    };
  }

  return null;
}

function digestSummaryMarker(grouped, blockedOrStuckCount = 0) {
  const parts = TELEGRAM_SECTION_ORDER.map((status) => {
    const count = Array.isArray(grouped?.[status]) ? grouped[status].length : 0;
    return `${status}:${count}`;
  });
  parts.push(`alerts:${blockedOrStuckCount}`);
  return `digest_15m ${parts.join(" ")}`;
}

function limitTelegramMessage(text, maxChars = 3900) {
  const raw = String(text || "");
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, Math.max(0, maxChars - 80)).trimEnd()}\n\n...truncated (message exceeds Telegram length limit)`;
}

function buildTelegramDigestMessage(chatId, tasks = [], stepsByTask = new Map()) {
  const grouped = groupTasksBySection(tasks);
  const lines = [];
  lines.push("Mission Control Update (every 15m)");
  lines.push(`Chat: ${String(chatId)}`);
  lines.push(`Time: ${new Date().toLocaleString()}`);
  lines.push("");

  for (const status of TELEGRAM_SECTION_ORDER) {
    const sectionTasks = grouped[status] || [];
    lines.push(`${TELEGRAM_SECTION_LABEL[status]} (${sectionTasks.length}):`);
    if (sectionTasks.length === 0) {
      lines.push("- none");
      lines.push("");
      continue;
    }
    const capped = sectionTasks.slice(0, status === "done" ? config.telegramDigestDoneLimit : 25);
    for (const task of capped) {
      lines.push(`- #${String(task._id)} ${normalizedTaskTitle(task)}`);
    }
    const hidden = sectionTasks.length - capped.length;
    if (hidden > 0) {
      lines.push(`- ... +${hidden} more`);
    }
    lines.push("");
  }

  const blockedOrStuck = [];
  for (const task of tasks) {
    const steps = stepsByTask.get(String(task._id)) || [];
    const detail = buildBlockedOrStuckReason(task, steps);
    if (!detail) continue;
    blockedOrStuck.push(
      `- #${String(task._id)} ${normalizedTaskTitle(task)} — ${detail.state} — Reason: ${detail.reason}`
    );
  }

  lines.push("Blocked/Stuck Alerts:");
  if (blockedOrStuck.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...blockedOrStuck);
  }

  return {
    message: lines.join("\n").trim(),
    grouped,
    blockedOrStuckCount: blockedOrStuck.length,
  };
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

function isInFlightAutomationStatus(status) {
  return ["queued", "running", "retrying"].includes(String(status || ""));
}

async function startAutomationRun({
  taskId,
  role,
  agentName,
  agentId,
  dispatchType,
  attempt,
  inputSummary,
}) {
  const runId = await m((api).automation.createAutomationRun, {
    taskId,
    role,
    agentName,
    dispatchType,
    status: "running",
    attempt,
    inputSummary,
    outputSummary: "Dispatch started",
    startedAt: Date.now(),
  });
  const eventKind = dispatchType === "review" ? "review" : dispatchType === "triage" ? "triage" : "dispatch";
  await emitExecutionEvent({
    taskId,
    actorAgentId: agentId,
    actorName: agentName || "System",
    actorRole: role === "reviewer" ? "reviewer" : role === "chief" ? "chief" : role === "specialist" ? "specialist" : "system",
    kind: eventKind,
    severity: "info",
    title: `${agentName || "Agent"} ${dispatchType} started`,
    summary: inputSummary || `${dispatchType} dispatch started`,
    workDone: "Dispatch/run started.",
    workingNow: inputSummary || "Processing task execution.",
    nextSteps: "Await run completion result.",
    relatedRunId: runId,
    detailsJson: {
      dispatchType,
      attempt: Number(attempt ?? 1),
      status: "running",
    },
  });
  return runId;
}

async function finishAutomationRun({
  taskId,
  role,
  agentName,
  agentId,
  dispatchType,
  attempt,
  inputSummary,
  startedAt,
  result,
  successSummary,
  failureSummary,
}) {
  const runId = await m((api).automation.createAutomationRun, {
    taskId,
    role,
    agentName,
    dispatchType,
    status: result.code === 0 ? "succeeded" : "failed",
    attempt,
    inputSummary,
    outputSummary:
      result.code === 0
        ? successSummary
        : `${failureSummary} (${String(result.code)})`,
    error:
      result.code === 0
        ? undefined
        : String(result.stderr || result.stdout || "").slice(0, 500),
    startedAt: startedAt ?? Date.now(),
    finishedAt: Date.now(),
  });
  const eventKind = dispatchType === "review" ? "review" : dispatchType === "triage" ? "triage" : "dispatch";
  await emitExecutionEvent({
    taskId,
    actorAgentId: agentId,
    actorName: agentName || "System",
    actorRole: role === "reviewer" ? "reviewer" : role === "chief" ? "chief" : role === "specialist" ? "specialist" : "system",
    kind: eventKind,
    severity: result.code === 0 ? "success" : "error",
    title: `${agentName || "Agent"} ${dispatchType} ${result.code === 0 ? "completed" : "failed"}`,
    summary:
      result.code === 0
        ? successSummary || `${dispatchType} dispatch completed`
        : `${failureSummary || `${dispatchType} dispatch failed`} (${String(result.code)})`,
    workDone: result.code === 0 ? "Execution finished successfully." : "Execution finished with failure.",
    workingNow: result.code === 0 ? "Waiting for proof/handoff validation." : "Awaiting retry/recovery.",
    nextSteps:
      result.code === 0
        ? "Proceed with evidence validation and handoff."
        : "Run blocked recovery or retry dispatch.",
    blockers:
      result.code === 0
        ? ""
        : String(result.stderr || result.stdout || "").slice(0, 500),
    detailsMarkdown: String(result?.stdout || "").slice(0, config.executionEventMaxDetailsChars),
    detailsJson: {
      dispatchType,
      attempt: Number(attempt ?? 1),
      status: result.code === 0 ? "succeeded" : "failed",
      code: Number(result.code ?? 1),
    },
    relatedRunId: runId,
  });
  return runId;
}

async function runOpenClawAgent({ role, task, prompt, targetAgent }) {
  if (!config.autoDispatchEnabled) return { skipped: true, reason: "AUTO_DISPATCH_DISABLED" };
  const requestedAgentId = inferOpenClawAgentId(targetAgent);
  if (config.enforceConfiguredModelOnly && !config.openclawModelLockEnabled) {
    return {
      code: 1,
      stdout: "",
      stderr:
        "[model-lock] dispatch blocked: ENFORCE_CONFIGURED_MODEL_ONLY=true requires OPENCLAW_MODEL_LOCK_ENABLED=true.",
      role,
      taskId: String(task._id),
      agentId: requestedAgentId,
    };
  }
  const modelLockStatus = getOpenClawModelLockStatus();
  if (!modelLockStatus.ok) {
    return {
      code: 1,
      stdout: "",
      stderr:
        `[model-lock] dispatch blocked before execution: ${modelLockStatus.reason || "invalid_openclaw_model_lock"}.\n` +
        `Expected provider/model lock: ${String(
          config.openclawModelLockExact || config.openclawModelLockPrefix || config.openclawProviderLock
        )}`,
      role,
      taskId: String(task._id),
      agentId: requestedAgentId,
    };
  }

  const baseArgs = [];
  if (config.openclawProfile) baseArgs.push("--profile", config.openclawProfile);
  const withModelValidation = (payload) => enforceDispatchResultModelHints(payload);

  const invoke = (agentId) =>
    new Promise((resolve) => {
      const args = [...baseArgs, "agent", "--agent", agentId, "--message", prompt, "--json"];
      const child = spawn(config.openclawBin, args, { cwd: projectRoot });
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
        }, 1500).unref();
      }, config.openclawDispatchTimeoutMs);
      const finalize = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(payload);
      };
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        const timedOutMsg = timedOut
          ? `\n[dispatch-timeout] OpenClaw dispatch exceeded ${Math.round(
              config.openclawDispatchTimeoutMs / 1000
            )}s and was terminated.`
          : "";
        finalize({
          code: timedOut ? 124 : code ?? 1,
          stdout,
          stderr: `${stderr || ""}${timedOutMsg}`,
          role,
          taskId: String(task._id),
          agentId,
        });
      });
      child.on("error", (error) => {
        finalize({
          code: 1,
          stdout,
          stderr: `${stderr || ""}\n[dispatch-error] ${String(error?.message || error)}`,
          role,
          taskId: String(task._id),
          agentId,
        });
      });
    });

  const first = await invoke(requestedAgentId);
  const combinedOut = `${first.stderr || ""}\n${first.stdout || ""}`;
  if (
    first.code !== 0 &&
    requestedAgentId !== "main" &&
    /Unknown agent id/i.test(combinedOut)
  ) {
    const strictRoutingForSpecialist = role === "specialist" && isStrictAccountabilityGateEnabled();
    if (!config.allowAgentFallbackToMain || strictRoutingForSpecialist) {
      return withModelValidation({
        ...first,
        stderr:
          `[strict-routing] Unknown agent '${requestedAgentId}'. Fallback to main is disabled. ` +
          `Create the missing OpenClaw agent or set ALLOW_AGENT_FALLBACK_TO_MAIN=true.\n` +
          (first.stderr || ""),
      });
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
    return withModelValidation(fallback);
  }

  const gatewayIssueDetected =
    first.code !== 0 &&
    /(gateway closed|gateway connect failed|tick timeout|ws:\/\/127\.0\.0\.1:18889)/i.test(
      combinedOut
    );
  if (gatewayIssueDetected && Date.now() - lastGatewayRestartAt > 60 * 1000) {
    lastGatewayRestartAt = Date.now();
    try {
      const restartArgs = [...baseArgs, "gateway", "restart"];
      const restart = spawnSync(config.openclawBin, restartArgs, {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 30_000,
      });
      const retry = await invoke(requestedAgentId);
      if (retry.code === 0) {
        retry.stdout =
          `[auto-heal] OpenClaw gateway restart applied after transport failure.\n` +
          (retry.stdout || "");
      } else {
        retry.stderr =
          `[auto-heal] gateway restart attempted (status=${String(
            restart.status ?? "unknown"
          )}).\n` + (retry.stderr || "");
      }
      return withModelValidation(retry);
    } catch (error) {
      return withModelValidation({
        ...first,
        stderr:
          `${first.stderr || ""}\n` +
          `[auto-heal] gateway restart attempt failed: ${String(error?.message || error)}`,
      });
    }
  }

  return withModelValidation(first);
}

async function attemptSpecialistQualityAutofix({
  task,
  specialist,
  workflowKind,
  issues = [],
  requiredOutputPath = "",
  stepIndex = 0,
  totalSteps = 1,
  nextHandoff = "Reviewer",
  runs = [],
  dispatchContext = "quality_gate",
}) {
  if (!config.specialistQualityAutofixEnabled || config.specialistQualityAutofixMaxAttempts <= 0) {
    return { attempted: false, reason: "autofix_disabled" };
  }
  if (!specialist?._id) return { attempted: false, reason: "missing_specialist" };

  const previousAttempts = countQualityAutofixAttempts(runs, specialist.name);
  if (previousAttempts >= config.specialistQualityAutofixMaxAttempts) {
    return {
      attempted: false,
      reason: "autofix_budget_exhausted",
      previousAttempts,
    };
  }

  const attempt = previousAttempts + 1;
  const prompt = buildQualityRepairPrompt({
    task,
    specialist,
    workflowKind,
    issues,
    requiredOutputPath,
    stepIndex,
    totalSteps,
    nextHandoff,
  });
  await emitExecutionEvent({
    taskId: task._id,
    actorAgentId: specialist._id,
    actorName: specialist.name,
    actorRole: "specialist",
    kind: "recovery",
    severity: "warning",
    title: `${specialist.name} auto-fix attempt ${attempt}`,
    summary: `Automatic quality repair triggered (${dispatchContext})`,
    workDone: "Quality/proof gate failed; initiating automatic specialist repair.",
    workingNow: "Applying fixes and rerunning validation.",
    nextSteps: "Post updated structured worklog with corrected evidence.",
    blockers: [...new Set((issues || []).map((item) => String(item || "").trim()).filter(Boolean))]
      .slice(0, 4)
      .join(" | "),
  });

  const preMessages = await q(api.messages.listByTask, { taskId: task._id });
  const preMessageCount = Number(preMessages?.length ?? 0);
  const dispatchStartedAt = Date.now();
  const runId = await startAutomationRun({
    taskId: task._id,
    role: "specialist",
    agentName: specialist.name,
    agentId: specialist._id,
    dispatchType: "quality_repair",
    attempt,
    inputSummary: `Auto quality repair for ${specialist.name} (${dispatchContext})`,
  });
  if (Number.isFinite(stepIndex)) {
    await attachDispatchRunToStep(task._id, Number(stepIndex), runId);
  }

  const result = await runOpenClawAgent({
    role: "specialist",
    task,
    prompt,
    targetAgent: specialist,
  });
  const runFinalId = await finishAutomationRun({
    taskId: task._id,
    role: "specialist",
    agentName: specialist.name,
    agentId: specialist._id,
    dispatchType: "quality_repair",
    attempt,
    inputSummary: `Auto quality repair for ${specialist.name} (${dispatchContext})`,
    startedAt: dispatchStartedAt,
    result,
    successSummary: "Auto quality repair dispatch completed",
    failureSummary: "Auto quality repair dispatch failed",
  });
  if (Number.isFinite(stepIndex)) {
    await attachDispatchRunToStep(task._id, Number(stepIndex), runFinalId);
  }

  if (result.code === 0) {
    await m((api).automation.recordAssigneeHeartbeat, {
      taskId: task._id,
      agentId: specialist._id,
      agentName: specialist.name,
      note: `Automatic quality repair attempt ${attempt} executed for ${specialist.name}`,
    });
    let postMessages = await q(api.messages.listByTask, { taskId: task._id });
    const specialistCommentPosted = (postMessages || [])
      .slice(preMessageCount)
      .some((msg) => String(msg?.fromName || "").toLowerCase() === String(specialist.name || "").toLowerCase());
    if (!specialistCommentPosted) {
      await relaySpecialistRunUpdate({
        taskId: task._id,
        task,
        specialist,
        result,
        stepIndex: Number(stepIndex) || 0,
        totalSteps: Math.max(1, Number(totalSteps) || 1),
        workflowKind,
        nextHandoff,
      });
      postMessages = await q(api.messages.listByTask, { taskId: task._id });
    }
    return {
      attempted: true,
      success: true,
      attempt,
      result,
      runId: runFinalId,
      postMessages,
    };
  }

  return {
    attempted: true,
    success: false,
    attempt,
    result,
    runId: runFinalId,
  };
}

function resolveTaskWorkflowKind(task, command) {
  if (!config.engineeringWorkflowsEnabled) return "general";
  return resolveWorkflowKind({
    command: command || task?.workflowCommand,
    text: `${task?.title || ""}\n${task?.description || ""}\n${task?.intakeText || ""}`,
    existingKind: task?.workflowKind,
  });
}

function normalizeOrchestrationModel(task) {
  const model = String(task?.orchestrationModel || "").trim().toLowerCase();
  if (model === "chief_pm_parallel") return "chief_pm_parallel";
  if (model === "legacy_sequential") return "legacy_sequential";
  return config.chiefPmParallelDefault ? "chief_pm_parallel" : "legacy_sequential";
}

function isChiefPmParallelTask(task) {
  if (!config.hierarchicalPmWorkflowEnabled) return false;
  return normalizeOrchestrationModel(task) === "chief_pm_parallel";
}

function findAgentByNames(agentsMap, names = []) {
  for (const name of names) {
    if (!name) continue;
    const direct = agentsMap.byName.get(name);
    if (direct) return direct;
  }
  return null;
}

function plannerAliasMapForRuntime(agentsMap) {
  if (config.strictRoleRouting || !config.legacyAgentRoutingEnabled) return {};
  const alias = { ...PARALLEL_TO_LEGACY_AGENT_ALIAS };
  if (agentsMap.byName.has("Reviewer")) alias.Reviewer = "Reviewer";
  return alias;
}

function normalizeGraphNodeKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isExecutionGraphApiUnavailableError(error) {
  const message = String(error?.message || error || "");
  return /Could not find public function.*executionGraph|BadConvexFunctionIdentifier.*executionGraph|executionGraph:[a-z_]+/i.test(
    message
  );
}

async function listGraphNodes(taskId) {
  if (!config.hierarchicalPmWorkflowEnabled) return [];
  try {
    return (await q((api).executionGraph.listByTask, { taskId })) || [];
  } catch (error) {
    const message = String(error?.message || error || "");
    if (
      /Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(
        message
      )
    ) {
      return [];
    }
    throw error;
  }
}

async function recomputeGraphRunnable(taskId) {
  if (!config.hierarchicalPmWorkflowEnabled) return { nodes: [] };
  try {
    return (
      (await m((api).executionGraph.recomputeRunnable, {
        taskId,
      })) || { nodes: [] }
    );
  } catch (error) {
    const message = String(error?.message || error || "");
    if (
      /Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(
        message
      )
    ) {
      return { nodes: [] };
    }
    throw error;
  }
}

async function ensureChiefPmGraph(task, agentsMap, chief) {
  const workflowKind = resolveTaskWorkflowKind(task);
  const projectManagerCandidates =
    config.strictPmAgentRequired || config.strictRoleRouting
      ? ["Project Manager"]
      : ["Project Manager", "Peter", "Jarvis", config.chiefAgentName];
  const projectManager = findAgentByNames(agentsMap, projectManagerCandidates);
  if (!projectManager) {
    throw new Error("role_agent_missing:project_manager");
  }
  const planned = buildParallelExecutionPlan({
    task,
    workflowKind,
    agentsByName: agentsMap.byName,
    legacyAliasMap: plannerAliasMapForRuntime(agentsMap),
    strictRoleRouting: config.strictRoleRouting,
  });

  let graphResult;
  try {
    graphResult = await m((api).executionGraph.initGraph, {
      taskId: task._id,
      graphVersion: Number(task?.graphVersion ?? 1),
      nodes: planned.nodes.map((node) => ({
        nodeKey: node.nodeKey,
        agentId: node.agentId,
        agentName: node.agentName,
        role: node.role,
        dependsOnNodeKeys: node.dependsOnNodeKeys,
        requiredProof: node.requiredProof,
        status: node.dependsOnNodeKeys.length > 0 ? "dependency_wait" : "runnable",
      })),
    });
  } catch (error) {
    if (isExecutionGraphApiUnavailableError(error)) {
      const wrapped = new Error(`execution_graph_unavailable: ${String(error?.message || error || "")}`);
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }

  const nextAction =
    "Project Manager is coordinating dependency graph and parallel specialist execution.";
  await m(api.tasks.updateWorkflowMeta, {
    id: task._id,
    workflowKind,
    workflowCommand: task.workflowCommand,
    workflowVersion: 1,
    nextAction,
    orchestrationModel: "chief_pm_parallel",
    projectManagerAgentId: projectManager._id,
    dependencySpec: planned.dependencySpec,
    graphVersion: Number(task?.graphVersion ?? 1),
    graphReadyAt: Date.now(),
  });
  await m(api.tasks.assign, {
    id: task._id,
    assigneeIds: [projectManager._id],
    agentName: chief?.name || config.chiefAgentName,
  });
  await m(api.tasks.updateStatus, {
    id: task._id,
    status: "in_progress",
    agentId: chief?._id,
    agentName: chief?.name || config.chiefAgentName,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "executing",
    reviewStatus: "pending",
    nextAction,
  });

  await emitExecutionEvent({
    taskId: task._id,
    actorAgentId: chief?._id,
    actorName: chief?.name || config.chiefAgentName,
    actorRole: "chief",
    kind: "dispatch",
    severity: "success",
    title: "Chief assigned task to Project Manager",
    summary: `PM graph ready: ${planned.selectedSpecialists.join(", ")}`,
    workDone: "Chief triaged task and initialized PM dependency graph.",
    workingNow: `${projectManager.name} coordinating specialist nodes.`,
    nextSteps: "PM scheduler dispatches all runnable specialist nodes in parallel.",
    blockers: "",
    detailsMarkdown:
      `### Chief -> PM Graph Handoff\n` +
      `- Workflow: ${workflowKind}\n` +
      `- PM: ${projectManager.name}\n` +
      `- Specialists: ${planned.selectedSpecialists.join(", ")}\n` +
      `- Override: ${planned.usedOverride ? "manual dependency override detected" : "auto-inferred dependencies"}\n`,
    detailsJson: {
      orchestrationModel: "chief_pm_parallel",
      projectManager: projectManager.name,
      selectedSpecialists: planned.selectedSpecialists,
      graphNodes: planned.nodes.map((node) => ({
        nodeKey: node.nodeKey,
        agentName: node.agentName,
        runtimeAgentName: node.runtimeAgentName,
        dependsOn: node.dependsOnNodeKeys,
      })),
    },
  });

  return {
    projectManager,
    workflowKind,
    graphNodes: graphResult?.nodes ?? planned.nodes,
    planned,
  };
}

function isTerminalExecutionNodeStatus(status) {
  return ["completed", "skipped"].includes(String(status || ""));
}

function executionNodeInFlightKey(taskId, nodeKey) {
  return `${String(taskId)}:${normalizeGraphNodeKey(nodeKey)}`;
}

function resolveExecutionNodeAgent(node, agentsMap) {
  const direct = node?.agentId ? agentsMap.byId.get(String(node.agentId)) : null;
  if (direct) return direct;
  const byName = agentsMap.byName.get(String(node?.agentName || ""));
  if (byName) return byName;
  if (config.strictRoleRouting || !config.legacyAgentRoutingEnabled) return null;
  const aliasName = PARALLEL_TO_LEGACY_AGENT_ALIAS[String(node?.agentName || "")];
  if (aliasName) return agentsMap.byName.get(aliasName) || null;
  return null;
}

function fallbackCandidateNamesForNode(node) {
  if (config.strictRoleRouting || !config.legacyAgentRoutingEnabled) return [];
  const roleName = String(node?.agentName || "").trim();
  const names = [];
  const legacyAlias = PARALLEL_TO_LEGACY_AGENT_ALIAS[roleName];
  if (legacyAlias) names.push(legacyAlias);
  const parallelAlias = LEGACY_TO_PARALLEL_AGENT_ALIAS[roleName];
  if (parallelAlias) names.push(parallelAlias);
  if (roleName === "Operations") names.push("Bruce", "Steve");
  if (roleName === "Backend") names.push("Dev");
  if (roleName === "Database") names.push("Dev");
  if (roleName === "Frontend") names.push("Dev");
  if (roleName === "Documentation") names.push("Peter");
  if (roleName === "Designer") names.push("Natasha");
  if (roleName === "Reviewer") names.push(config.reviewerAgentName);
  return [...new Set(names.filter(Boolean))];
}

async function isAgentBusyInPmGraphElsewhere(agentId, taskId) {
  try {
    const rows = (await q((api).executionGraph.currentByAgent, { agentId })) || [];
    return rows.some(
      (row) =>
        String(row?.taskId || "") !== String(taskId) &&
        ["running", "runnable", "queued", "dependency_wait", "waiting_handoff"].includes(
          String(row?.status || "")
        )
    );
  } catch (error) {
    if (isExecutionGraphApiUnavailableError(error)) return false;
    throw error;
  }
}

async function findFallbackExecutionNodeAgent(node, agentsMap, taskId) {
  const current = resolveExecutionNodeAgent(node, agentsMap);
  const currentId = String(current?._id || node?.agentId || "");
  const candidates = fallbackCandidateNamesForNode(node);
  for (const name of candidates) {
    const agent = agentsMap.byName.get(name);
    if (!agent) continue;
    if (String(agent._id) === currentId) continue;
    const busy = await isAgentBusyInPmGraphElsewhere(agent._id, taskId);
    if (busy) continue;
    return agent;
  }
  return null;
}

function summarizeAgentWorklogForNode(messages, agent) {
  const byAgent = (messages || [])
    .filter((msg) => String(msg?.fromAgentId || "") === String(agent?._id || ""))
    .sort((a, b) => Number(a._creationTime ?? 0) - Number(b._creationTime ?? 0));
  const latest = byAgent[byAgent.length - 1];
  if (!latest) {
    return {
      hasWorklog: false,
      summary: "",
      evidencePaths: [],
      sections: {
        objective: "",
        actionsTaken: "",
        findings: "",
        evidence: "",
        blockers: "",
        nextHandoff: "",
      },
      messageId: undefined,
    };
  }
  const sections = parseStructuredWorklogSections(String(latest.content || ""));
  const evidencePaths = normalizeEvidencePaths(
    extractStructuredEvidencePaths(String(latest.content || ""))
  );
  return {
    hasWorklog: isStructuredWorklog(String(latest.content || ""), { requirePath: false }),
    summary: summarizeOpenClawRunOutput({ stdout: latest.content || "" }).lines.join(" | "),
    evidencePaths,
    sections,
    messageId: latest._id,
  };
}

function requiredProofSatisfied(node, evidencePaths, hasWorklog) {
  const proof = String(node?.requiredProof || "comment_summary");
  if (proof === "none") return true;
  if (proof === "output_path") return (evidencePaths?.length ?? 0) > 0;
  if (proof === "document") return hasWorklog;
  return hasWorklog;
}

const ACTIVE_PM_NODE_STATUSES = new Set([
  "running",
  "runnable",
  "queued",
  "dependency_wait",
  "waiting_handoff",
]);

function tokenizeLower(value = "") {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function selectPmReworkSpecialistNode(nodes = [], summary = "", findings = []) {
  const specialists = (nodes || []).filter((node) => String(node?.role || "") === "specialist");
  if (specialists.length === 0) return null;

  const feedbackTokens = new Set(tokenizeLower(`${summary}\n${(findings || []).join("\n")}`));
  const scoreNodeByFeedback = (node) => {
    if (feedbackTokens.size === 0) return 0;
    const nodeTokens = new Set([
      ...tokenizeLower(node?.nodeKey || ""),
      ...tokenizeLower(node?.agentName || ""),
    ]);
    let score = 0;
    for (const token of nodeTokens) {
      if (feedbackTokens.has(token)) score += 1;
    }
    return score;
  };

  const freshnessScore = (node) =>
    Number(node?.lastProgressAt ?? node?.updatedAt ?? node?._creationTime ?? 0);
  const sortByPriority = (items = []) =>
    [...items].sort((a, b) => {
      const hintDelta = scoreNodeByFeedback(b) - scoreNodeByFeedback(a);
      if (hintDelta !== 0) return hintDelta;
      return freshnessScore(b) - freshnessScore(a);
    });

  const active = specialists.filter((node) =>
    ACTIVE_PM_NODE_STATUSES.has(String(node?.status || ""))
  );
  const activePreferred = sortByPriority(active)[0];
  if (activePreferred) return activePreferred;

  const completed = specialists.filter((node) =>
    ["completed", "skipped"].includes(String(node?.status || ""))
  );
  const completedPreferred = sortByPriority(completed)[0];
  if (completedPreferred) return completedPreferred;

  return sortByPriority(specialists)[0] || null;
}

function isReviewerReworkReason(reason = "") {
  return /review_changes_requested/i.test(String(reason || ""));
}

async function routePmReviewerRework({
  task,
  reviewerNode,
  nodes = [],
  agentsMap,
  chief,
  summary = "",
  findings = [],
  outputPaths = [],
  trigger = "review_decision",
}) {
  if (!task?._id || !reviewerNode?.nodeKey) return false;
  const availableNodes = (nodes || []).length > 0 ? nodes : await listGraphNodes(task._id);
  if ((availableNodes || []).length === 0) return false;

  const reviewerNodeKey = normalizeGraphNodeKey(reviewerNode.nodeKey);
  const specialistNode = selectPmReworkSpecialistNode(availableNodes, summary, findings);
  if (!specialistNode) {
    await emitExecutionEvent({
      taskId: task._id,
      actorAgentId: chief?._id,
      actorName: chief?.name || config.chiefAgentName,
      actorRole: "chief",
      kind: "recovery",
      severity: "error",
      title: "Chief could not route reviewer rework",
      summary: "review_rework_route_failed: no specialist node available for PM rework",
      workDone: "Reviewer requested changes, but no specialist rework target could be selected.",
      workingNow: "Task remains blocked until PM graph node mapping is repaired.",
      nextSteps: "Repair PM graph specialist nodes and rerun reviewer workflow.",
      blockers: "review_rework_route_failed:no_specialist_node",
    });
    return false;
  }

  const specialistNodeKey = normalizeGraphNodeKey(specialistNode.nodeKey);
  const specialistAgent = resolveExecutionNodeAgent(specialistNode, agentsMap);
  const specialistName = specialistAgent?.name || specialistNode.agentName || "Specialist";
  const specialistStatus = String(specialistNode.status || "");
  const specialistAlreadyActive = ACTIVE_PM_NODE_STATUSES.has(specialistStatus);

  if (!specialistAlreadyActive) {
    await m((api).executionGraph.resetNodeForRetry, {
      taskId: task._id,
      nodeKey: specialistNodeKey,
      reason: `review_rework_requested: reviewer requested changes for ${specialistName}`,
      incrementRetry: false,
    });
  }

  await m((api).executionGraph.resetNodeForRetry, {
    taskId: task._id,
    nodeKey: reviewerNodeKey,
    reason: `review_waiting_rework: waiting for ${specialistName} rework evidence`,
    incrementRetry: false,
  });
  await recomputeGraphRunnable(task._id);

  const orchestratorAgent =
    chief ||
    (task?.projectManagerAgentId
      ? agentsMap.byId.get(String(task.projectManagerAgentId))
      : agentsMap.byName.get("Project Manager")) ||
    null;
  await m(api.tasks.updateStatus, {
    id: task._id,
    status: "in_progress",
    agentId: orchestratorAgent?._id,
    agentName: orchestratorAgent?.name || config.chiefAgentName,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "executing",
    reviewStatus: "changes_requested",
    nextAction: `Reviewer requested changes. ${specialistName} is reworking and reviewer will rerun after updated evidence.`,
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + 2 * 60 * 1000,
    nextAction: `Waiting for ${specialistName} rework evidence before reviewer rerun`,
    chiefAgentId: chief?._id,
  });
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: orchestratorAgent?._id,
    fromName: orchestratorAgent?.name || config.chiefAgentName,
    kind: "handoff",
    workflowKind: resolveTaskWorkflowKind(task),
    content:
      `Chief/PM rework routing: ${specialistName} selected for reviewer-requested changes.` +
      `\nTrigger: ${trigger}` +
      `\nReviewer summary: ${summary || "changes requested"}` +
      ((findings || []).length > 0 ? `\nFindings:\n- ${findings.join("\n- ")}` : ""),
  });
  await emitExecutionEvent({
    taskId: task._id,
    actorAgentId: orchestratorAgent?._id,
    actorName: orchestratorAgent?.name || config.chiefAgentName,
    actorRole: orchestratorAgent?.name === "Project Manager" ? "project_manager" : "chief",
    kind: "handoff",
    severity: "warning",
    title: "Chief routed reviewer rework",
    summary: `${specialistName} selected for rework; reviewer queued for re-validation`,
    workDone: specialistAlreadyActive
      ? `Reviewer findings routed to active specialist node ${specialistNode.agentName}.`
      : `Specialist node ${specialistNode.agentName} reopened for rework.`,
    workingNow: `${specialistName} is the active rework owner.`,
    nextSteps: "Specialist posts updated proof; reviewer reruns after dependency recompute.",
    blockers: (findings || []).slice(0, 3).join(" | "),
    evidencePaths: normalizeEvidencePaths(outputPaths || []),
    detailsJson: {
      trigger,
      reviewerNodeKey,
      specialistNodeKey,
      specialistAlreadyActive,
    },
  });
  return true;
}

async function dispatchParallelNode({ task, node, agentsMap, chief }) {
  const nodeKey = normalizeGraphNodeKey(node.nodeKey);
  const inflightKey = executionNodeInFlightKey(task._id, nodeKey);
  if (pmNodeDispatchInFlight.has(inflightKey)) return;
  pmNodeDispatchInFlight.add(inflightKey);
  let specialist = null;
  const projectManager = task?.projectManagerAgentId
    ? agentsMap.byId.get(String(task.projectManagerAgentId))
    : agentsMap.byName.get("Project Manager");
  const nodeActorRole =
    node.role === "reviewer"
      ? "reviewer"
      : node.role === "project_manager"
        ? "project_manager"
        : "specialist";

  try {
    if (projectManager) {
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: projectManager._id,
        actorName: projectManager.name,
        actorRole: "project_manager",
        kind: "dispatch",
        severity: "info",
        title: `PM dispatching ${node.agentName}`,
        summary: `Node ${nodeKey} moved to dispatch evaluation`,
        workDone: "Project Manager evaluated node dependencies and availability.",
        workingNow: `Dispatching runnable node ${node.agentName}.`,
        nextSteps: "Start node and collect structured specialist proof.",
        blockers: "",
      });
    }
    specialist = resolveExecutionNodeAgent(node, agentsMap);
    if (!specialist) {
      await m((api).executionGraph.blockNode, {
        taskId: task._id,
        nodeKey,
        reason: `role_agent_missing: could not resolve canonical runtime agent for role ${node.agentName}`,
      });
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: chief?._id,
        actorName: chief?.name || config.chiefAgentName,
        actorRole: "chief",
        kind: "recovery",
        severity: "error",
        title: "Chief blocked PM node",
        summary: `${node.agentName} node blocked: runtime agent unavailable`,
        workDone: "Node blocked due to unresolved runtime agent mapping.",
        workingNow: "Waiting for agent provisioning.",
        nextSteps: "Provision missing canonical role agent and rerun.",
        blockers: `role_agent_missing:${node.agentName}`,
      });
      return;
    }

    const start = await m((api).executionGraph.startNode, {
      taskId: task._id,
      nodeKey,
      agentId: specialist._id,
    });
    if (!start?.ok) {
      if (String(start?.reason) === "agent_busy") {
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: Date.now() + 60 * 1000,
          nextAction: `${specialist.name} busy on another task; node ${node.agentName} remains queued`,
          chiefAgentId: chief?._id,
        });
        await emitExecutionEvent({
          taskId: task._id,
          actorAgentId: chief?._id,
          actorName: chief?.name || config.chiefAgentName,
          actorRole: "chief",
          kind: "recovery",
          severity: "warning",
          title: "PM node waiting for agent availability",
          summary: `${node.agentName} queued because ${specialist.name} is busy`,
          workDone: "Skipped node start to respect one-active-task-per-agent policy.",
          workingNow: `${specialist.name} is running another task.`,
          nextSteps: "Retry node start on next PM scheduler cycle.",
          blockers: "role_agent_unavailable: target specialist is busy on another running task",
          detailsJson: {
            nodeKey,
            reason: start?.reason,
            otherTaskId: start?.otherTaskId,
          },
        });
      }
      return;
    }

    await emitExecutionEvent({
      taskId: task._id,
      actorAgentId: specialist._id,
      actorName: specialist.name,
      actorRole: nodeActorRole,
      kind: "dispatch",
      severity: "info",
      title: `${node.agentName} node started`,
      summary: `PM dispatched node ${nodeKey}`,
      workDone: "Node moved to running and dispatch started.",
      workingNow: `Executing ${node.agentName} responsibilities.`,
      nextSteps: "Post structured worklog with evidence fields.",
      blockers: "",
      detailsJson: {
        nodeKey,
        dependsOn: node.dependsOnNodeKeys || [],
      },
    });

    const requiredOutputPath = await ensureAgentWritableOutputPathReady(task);
    const prompt =
      node.role === "reviewer"
        ? buildReviewerPrompt({
            task,
            workflowKind: resolveTaskWorkflowKind(task),
            acceptanceCriteria: task.acceptanceCriteria || [],
          })
        : buildSpecialistPrompt({
            task,
            specialist,
            workflowKind: resolveTaskWorkflowKind(task),
            stepIndex: 0,
            totalSteps: 1,
            nextSpecialist: null,
            deliverablesRoot: config.taskArtifactsRoot,
            requiredOutputPath,
          });

    const preMessages = await q(api.messages.listByTask, { taskId: task._id });
    const preCount = Number(preMessages?.length ?? 0);
    const dispatchStartedAt = Date.now();
    const runId = await startAutomationRun({
      taskId: task._id,
      role: node.role === "reviewer" ? "reviewer" : "specialist",
      agentName: specialist.name,
      agentId: specialist._id,
      dispatchType: "execution",
      attempt: Number(node.retryCount ?? 0) + 1,
      inputSummary: `PM dispatch node ${node.agentName}`,
    });

    const result = await runOpenClawAgent({
      role: node.role === "reviewer" ? "reviewer" : "specialist",
      task,
      prompt,
      targetAgent: specialist,
    });
    const runSummary = summarizeOpenClawRunOutput(result);
    await finishAutomationRun({
      taskId: task._id,
      role: node.role === "reviewer" ? "reviewer" : "specialist",
      agentName: specialist.name,
      agentId: specialist._id,
      dispatchType: "execution",
      attempt: Number(node.retryCount ?? 0) + 1,
      inputSummary: `PM dispatch node ${node.agentName}`,
      startedAt: dispatchStartedAt,
      result,
      successSummary: "PM node dispatch invoked",
      failureSummary: "PM node dispatch failed",
    });

    if (result.code !== 0) {
      const failure = String(result.stderr || result.stdout || "unknown dispatch failure").slice(0, 400);
      const transientDispatchFailure = isTransientDispatchFailureText(
        `${String(result.stderr || "")}\n${String(result.stdout || "")}\n${failure}`
      );
      if (transientDispatchFailure) {
        await m((api).executionGraph.resetNodeForRetry, {
          taskId: task._id,
          nodeKey,
          reason: `dispatch_retry_cooldown: transient dispatch failure for ${node.agentName}`,
          incrementRetry: false,
        });
        await emitExecutionEvent({
          taskId: task._id,
          actorAgentId: specialist._id,
          actorName: specialist.name,
          actorRole: nodeActorRole,
          kind: "recovery",
          severity: "warning",
          title: `${node.agentName} transient dispatch retry queued`,
          summary: "Transient provider/runtime failure; node kept runnable with cooldown",
          workDone: "Dispatch failed on a transient error; permanent retry budget was not consumed.",
          workingNow: "Node is cooling down before the next PM redispatch attempt.",
          nextSteps: "PM scheduler will retry after cooldown window.",
          blockers: failure,
          detailsMarkdown: String(result.stderr || result.stdout || "").slice(
            0,
            config.executionEventMaxDetailsChars
          ),
        });
        return;
      }
      await m((api).executionGraph.blockNode, {
        taskId: task._id,
        nodeKey,
        reason: `dispatch_failed: ${failure}`,
        status: "failed",
      });
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: specialist._id,
        actorName: specialist.name,
        actorRole: nodeActorRole,
        kind: "proof",
        severity: "error",
        title: `${node.agentName} node failed`,
        summary: "Dispatch failed before proof could be recorded",
        workDone: "Execution attempt failed.",
        workingNow: "Node moved to failed state.",
        nextSteps: "Chief/PM recovery will retry the node.",
        blockers: failure,
        detailsMarkdown: String(result.stderr || result.stdout || "").slice(
          0,
          config.executionEventMaxDetailsChars
        ),
      });
      return;
    }

    let postMessages = await q(api.messages.listByTask, { taskId: task._id });
    const newMessageByAgent = (postMessages || [])
      .slice(preCount)
      .some((msg) => String(msg?.fromAgentId || "") === String(specialist._id));
    if (!newMessageByAgent) {
      await relaySpecialistRunUpdate({
        taskId: task._id,
        task,
        specialist,
        result,
        stepIndex: 0,
        totalSteps: 1,
        workflowKind: resolveTaskWorkflowKind(task),
        nextHandoff: "Project Manager",
      });
      postMessages = await q(api.messages.listByTask, { taskId: task._id });
    }

    let nodeWorklog = summarizeAgentWorklogForNode(postMessages, specialist);
    let evidence = await inspectTaskEvidence(task._id);
    let scopedEvidencePaths = normalizeEvidencePaths([
      ...nodeWorklog.evidencePaths,
      ...(evidence.outputPaths || []),
    ]);
    let hasProof = requiredProofSatisfied(node, scopedEvidencePaths, nodeWorklog.hasWorklog);

    if (!hasProof) {
      const reason =
        String(node.requiredProof || "") === "output_path"
          ? "artifact_folder_empty: canonical artifact folder has no verifiable deliverable files"
          : "invalid_worklog_schema: structured node worklog missing";
      const qualityAutofix = await attemptSpecialistQualityAutofix({
        task,
        specialist,
        workflowKind: resolveTaskWorkflowKind(task),
        issues: [reason],
        requiredOutputPath: await ensureAgentWritableOutputPathReady(task),
        stepIndex: 0,
        totalSteps: 1,
        nextHandoff: node.role === "reviewer" ? "Reviewer" : "Project Manager",
        runs: await q((api).automation.listAutomationRunsByTask, { taskId: task._id }),
        dispatchContext: "pm_node_proof",
      });
      if (qualityAutofix.success) {
        postMessages = qualityAutofix.postMessages || (await q(api.messages.listByTask, { taskId: task._id }));
        nodeWorklog = summarizeAgentWorklogForNode(postMessages, specialist);
        evidence = await inspectTaskEvidence(task._id);
        scopedEvidencePaths = normalizeEvidencePaths([
          ...nodeWorklog.evidencePaths,
          ...(evidence.outputPaths || []),
        ]);
        hasProof = requiredProofSatisfied(node, scopedEvidencePaths, nodeWorklog.hasWorklog);
      }
    }

    if (!hasProof) {
      const reason =
        String(node.requiredProof || "") === "output_path"
          ? "artifact_folder_empty: canonical artifact folder has no verifiable deliverable files"
          : "invalid_worklog_schema: structured node worklog missing";
      const retryCount = Number(node.retryCount ?? 0);
      const canAutoRetryBeforeBlock =
        String(node.requiredProof || "") === "output_path" &&
        reason.startsWith("artifact_folder_empty") &&
        retryCount < Math.max(1, Number(config.chiefNodeRetryBudget || 1));
      if (canAutoRetryBeforeBlock) {
        await m((api).executionGraph.resetNodeForRetry, {
          taskId: task._id,
          nodeKey,
          reason: `auto_retry_pending: artifact_folder_empty retry ${retryCount + 1}/${Math.max(
            1,
            Number(config.chiefNodeRetryBudget || 1)
          )}`,
        });
        await emitExecutionEvent({
          taskId: task._id,
          actorAgentId: specialist._id,
          actorName: specialist.name,
          actorRole: nodeActorRole,
          kind: "recovery",
          severity: "warning",
          title: `${node.agentName} auto-retry queued`,
          summary:
            "Proof missing on first pass; node reset to runnable for automatic retry before blocking.",
          workDone: "Proof gate failed for output_path evidence.",
          workingNow: `Retry ${retryCount + 1}/${Math.max(
            1,
            Number(config.chiefNodeRetryBudget || 1)
          )} queued automatically.`,
          nextSteps: "PM scheduler will redispatch node and re-validate canonical artifact evidence.",
          blockers: reason,
          detailsJson: {
            nodeKey,
            retryCount: retryCount + 1,
            autoRetryBeforeBlock: true,
          },
        });
        return;
      }
      await m((api).executionGraph.blockNode, {
        taskId: task._id,
        nodeKey,
        reason,
      });
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: specialist._id,
        actorName: specialist.name,
        actorRole: nodeActorRole,
        kind: "proof",
        severity: "warning",
        title: `${node.agentName} node missing proof`,
        summary: reason,
        workDone: "Node execution completed but proof gate failed.",
        workingNow: "Node moved to blocked awaiting corrected evidence.",
        nextSteps: "Post structured worklog and populate canonical artifact folder.",
        blockers: reason,
      });
      return;
    }

    await m((api).executionGraph.recordNodeProof, {
      taskId: task._id,
      nodeKey,
      proofPayload: {
        summary: nodeWorklog.summary || runSummary.lines.join(" | "),
        paths: scopedEvidencePaths,
        proofMessageId: nodeWorklog.messageId,
        proofDocumentIds: [],
        dispatchRunId: runId,
        workDone: nodeWorklog.sections.findings || "Node execution completed with evidence.",
        workingNow: nodeWorklog.sections.objective || `Completed ${node.agentName} node.`,
        nextSteps: nodeWorklog.sections.nextHandoff || "Project Manager will schedule dependent nodes.",
        blockers: nodeWorklog.sections.blockers || "",
      },
    });
    if (node.role === "reviewer") {
      const pathRequiredTask = taskRequiresOutputPathEvidence(task);
      const evidenceSnapshot = await inspectTaskEvidence(task._id);
      const outputPaths = normalizeEvidencePaths(evidenceSnapshot.outputPaths || []);
      const hasOutputPathEvidence = outputPaths.length > 0;
      const hasReviewerEvidence = nodeWorklog.hasWorklog || Boolean(nodeWorklog.summary);
      const qualityGate = evaluateImplementationQuality(task, evidenceSnapshot);
      const qualityPass = qualityGate.pass;
      const reviewerDecisionSources = [
        nodeWorklog.summary,
        nodeWorklog.sections?.findings,
        nodeWorklog.sections?.blockers,
        runSummary.worklogText,
        result?.stdout,
        result?.stderr,
      ];
      const reviewerDecisionSignal = inferReviewerDecisionSignal(...reviewerDecisionSources);
      let approved = false;
      let summary = "";
      let findings = [];

      if (config.reviewerDefaultDecision === "pass") {
        approved =
          hasReviewerEvidence && (!pathRequiredTask || hasOutputPathEvidence) && qualityPass;
        summary = approved
          ? "Reviewer auto-approved PM graph completion evidence."
          : "Reviewer auto-pass blocked: mandatory PM review evidence/proof gate not satisfied.";
        if (!hasReviewerEvidence) findings.push("Reviewer auto-pass blocked: structured review evidence missing.");
        if (pathRequiredTask && !hasOutputPathEvidence) {
          const pathIssue = deriveOutputPathEvidenceFailure(
            evidenceSnapshot,
            "review gate requires canonical Artifact Folder evidence"
          );
          findings.push(pathIssue?.reason || "review gate requires canonical Artifact Folder evidence.");
        }
        if (!qualityPass) findings.push(...qualityGate.findings);
      } else if (config.reviewerDefaultDecision === "fail") {
        approved = false;
        summary = "Reviewer requested changes (configured fail fallback).";
        findings = ["Manual verification required by reviewer configuration."];
      } else {
        approved =
          hasReviewerEvidence && (!pathRequiredTask || hasOutputPathEvidence) && qualityPass;
        summary = approved
          ? "Reviewer approved PM graph completion evidence."
          : "Reviewer requested changes: insufficient PM review evidence.";
        if (!hasReviewerEvidence) {
          findings.push("No structured reviewer evidence/worklog captured for PM review node.");
        }
        if (pathRequiredTask && !hasOutputPathEvidence) {
          const pathIssue = deriveOutputPathEvidenceFailure(
            evidenceSnapshot,
            "review gate requires canonical Artifact Folder evidence"
          );
          findings.push(pathIssue?.reason || "review gate requires canonical Artifact Folder evidence.");
        }
        if (!qualityPass) findings.push(...qualityGate.findings);
      }

      const nonActionableReviewerReject =
        reviewerDecisionSignal === "reject" &&
        approved &&
        isNonActionableStatusAlignmentReject(...reviewerDecisionSources, findings.join(" | "));
      if (reviewerDecisionSignal === "reject") {
        if (nonActionableReviewerReject) {
          summary =
            "Reviewer noted status-alignment concern, but all verifiable review gates passed. Auto-approving without rework loop.";
          if (!findings.some((item) => /non-actionable status-alignment/i.test(String(item)))) {
            findings.unshift(
              "Non-actionable status-alignment concern ignored because artifact/proof/quality gates already passed."
            );
          }
        } else {
          approved = false;
          summary = "Reviewer requested changes (explicit reviewer verdict overrides auto-approval).";
          if (!findings.some((item) => /explicit reviewer verdict/i.test(String(item)))) {
            findings.unshift("Explicit reviewer verdict indicates FAIL/changes requested.");
          }
        }
      } else if (reviewerDecisionSignal === "approve" && !approved) {
        if (!findings.some((item) => /mandatory review gates/i.test(String(item)))) {
          findings.unshift("Reviewer output indicates approval, but mandatory review gates still failed.");
        }
      }

      await m((api).automation.applyReviewDecision, {
        taskId: task._id,
        reviewerAgentId: specialist._id,
        reviewerAgentName: specialist.name,
        approved,
        summary,
        findings,
        evidenceRefs: scopedEvidencePaths.length > 0 ? scopedEvidencePaths : outputPaths,
        fallbackStatus: "in_progress",
      });

      if (!approved) {
        const reason = clipText(
          `review_changes_requested: ${findings[0] || "reviewer requested changes"}`,
          280
        );
        await m((api).executionGraph.blockNode, {
          taskId: task._id,
          nodeKey,
          reason,
          status: "blocked",
        });
        await emitExecutionEvent({
          taskId: task._id,
          actorAgentId: specialist._id,
          actorName: specialist.name,
          actorRole: "reviewer",
          kind: "review",
          severity: "warning",
          title: "Reviewer requested PM rework",
          summary,
          workDone: "PM review completed with change requests.",
          workingNow: "Reviewer node blocked awaiting specialist rework evidence.",
          nextSteps: "Chief/PM should route rework and rerun reviewer node after recovery.",
          blockers: findings.join(" | "),
          evidencePaths: outputPaths,
        });
        await routePmReviewerRework({
          task,
          reviewerNode: { ...node, status: "blocked", stuckReason: reason },
          nodes: await listGraphNodes(task._id),
          agentsMap,
          chief,
          summary,
          findings,
          outputPaths,
          trigger: "review_decision",
        });
        return;
      }
      const refreshedTask = await q(api.tasks.get, { id: task._id });
      if (String(refreshedTask?.reviewStatus || "") !== "approved") {
        const reason = `review_decision_not_approved: reviewStatus is ${String(
          refreshedTask?.reviewStatus || "pending"
        )}`;
        await m((api).executionGraph.blockNode, {
          taskId: task._id,
          nodeKey,
          reason,
          status: "blocked",
        });
        await emitExecutionEvent({
          taskId: task._id,
          actorAgentId: specialist._id,
          actorName: specialist.name,
          actorRole: "reviewer",
          kind: "review",
          severity: "warning",
          title: "Reviewer completion blocked",
          summary: "Reviewer node prevented from completing without approved review decision.",
          workDone: "Reviewer run finished, but review decision status was not approved.",
          workingNow: "Reviewer node remains blocked awaiting explicit approved review decision.",
          nextSteps: "Chief/PM should rerun reviewer after resolving findings.",
          blockers: reason,
          evidencePaths: outputPaths,
        });
        return;
      }
    }
    await m((api).executionGraph.completeNode, {
      taskId: task._id,
      nodeKey,
      summary: nodeWorklog.summary || runSummary.lines.join(" | "),
    });
    await recomputeGraphRunnable(task._id);

    await emitExecutionEvent({
      taskId: task._id,
      actorAgentId: specialist._id,
      actorName: specialist.name,
      actorRole: nodeActorRole,
      kind: node.role === "reviewer" ? "review" : "handoff",
      severity: "success",
      title: `${node.agentName} node completed`,
      summary: `${node.agentName} completed with proof`,
      workDone: nodeWorklog.sections.findings || "Node work completed and proof accepted.",
      workingNow: "Waiting for PM to schedule next runnable nodes.",
      nextSteps: "Dependent nodes are now eligible to run.",
      blockers: nodeWorklog.sections.blockers || "",
      evidencePaths: scopedEvidencePaths,
    });
  } catch (error) {
    const message = clipText(String(error?.message || error || "unknown pm node dispatch error"), 300);
    try {
      await m((api).executionGraph.blockNode, {
        taskId: task._id,
        nodeKey,
        reason: `dispatch_exception: ${message}`,
        status: "failed",
      });
    } catch {
      // ignore secondary block failure
    }
    await emitExecutionEvent({
      taskId: task._id,
      actorAgentId: specialist?._id,
      actorName: specialist?.name || node.agentName || "Unknown",
      actorRole: nodeActorRole,
      kind: "recovery",
      severity: "error",
      title: `${node.agentName} node crashed`,
      summary: "PM node dispatch path threw an unexpected exception",
      workDone: "Execution aborted by runtime exception.",
      workingNow: "Node forced to failed for chief recovery.",
      nextSteps: "Chief watchdog will retry or reassign this node.",
      blockers: `dispatch_exception: ${message}`,
      detailsMarkdown: String(error?.stack || message),
      detailsJson: {
        nodeKey,
        taskId: String(task?._id || ""),
      },
    });
    recordRuntimeError("pmScheduler", error);
  } finally {
    pmNodeDispatchInFlight.delete(inflightKey);
  }
}

function isTelegramConflictError(error) {
  const text = String(error?.message || error || "");
  return /error_code\"\s*:\s*409|Conflict:\s*terminated by other getUpdates request/i.test(text);
}

async function refreshPmTaskState(task, agentsMap, chief) {
  const nodes = await listGraphNodes(task._id);
  if ((nodes || []).length === 0) return false;
  const latestTask = (await q(api.tasks.get, { id: task._id })) || task;
  const graphHealth = await q((api).executionGraph.taskGraphHealth, { taskId: task._id });
  const runningCount = Number(graphHealth?.counts?.running ?? 0);
  const runnableCount = Number(graphHealth?.counts?.runnable ?? 0);
  const blockedCount =
    Number(graphHealth?.counts?.blocked ?? 0) + Number(graphHealth?.counts?.failed ?? 0);
  const dependencyWaitCount = Number(graphHealth?.counts?.dependency_wait ?? 0);
  const totalNodes = Number(graphHealth?.totalNodes ?? 0);
  const completedCount =
    Number(graphHealth?.counts?.completed ?? 0) + Number(graphHealth?.counts?.skipped ?? 0);
  const reviewRequired = latestTask.reviewRequired !== false;
  const reviewApproved = String(latestTask.reviewStatus || "") === "approved";
  const hasReviewerNode = (nodes || []).some(
    (node) => normalizeGraphNodeKey(node.nodeKey) === "reviewer"
  );
  const reviewerDone = (nodes || []).some(
    (node) => normalizeGraphNodeKey(node.nodeKey) === "reviewer" && String(node.status) === "completed"
  );
  const allNodesCompleted = totalNodes > 0 && completedCount === totalNodes;

  if (
    (reviewerDone && (!reviewRequired || reviewApproved)) ||
    (!reviewRequired && allNodesCompleted)
  ) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "done",
      agentId: chief?._id,
      agentName: chief?.name || config.chiefAgentName,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "completed",
      reviewStatus: reviewRequired ? "approved" : latestTask.reviewStatus ?? "pending",
      nextAction: "Completed via PM parallel workflow",
    });
    return true;
  }

  if (allNodesCompleted && reviewRequired && !reviewApproved) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "review",
      agentId: chief?._id,
      agentName: chief?.name || config.chiefAgentName,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "reviewing",
      reviewStatus: latestTask.reviewStatus ?? "pending",
      nextAction: hasReviewerNode
        ? "Awaiting explicit reviewer approval before task completion."
        : "Reviewer node missing from PM graph; chief/PM graph repair required before completion.",
    });
    if (!hasReviewerNode) {
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: chief?._id,
        actorName: chief?.name || config.chiefAgentName,
        actorRole: "chief",
        kind: "recovery",
        severity: "error",
        title: "Chief detected PM graph reviewer gap",
        summary: "reviewer_node_missing: all PM nodes completed without a reviewer node",
        workDone: "Completion blocked because reviewer gate cannot be validated.",
        workingNow: "Task held in review until PM graph is repaired.",
        nextSteps: "Add reviewer node and rerun review.",
        blockers: "reviewer_node_missing",
      });
    }
    return false;
  }

  if (graphHealth?.deadlock) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "blocked",
      agentId: chief?._id,
      agentName: chief?.name || config.chiefAgentName,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "errored",
      reviewStatus: "pending",
      nextAction:
        "PM graph deadlock detected: unresolved dependency cycle or unsatisfiable dependency set. Chief/PM repair required.",
    });
    await emitExecutionEvent({
      taskId: task._id,
      actorAgentId: chief?._id,
      actorName: chief?.name || config.chiefAgentName,
      actorRole: "chief",
      kind: "recovery",
      severity: "error",
      title: "Chief blocked task due to PM graph deadlock",
      summary: "dependency_deadlock: no runnable/running nodes while non-terminal nodes remain",
      workDone: "Chief detected PM graph deadlock and blocked task to prevent silent stall.",
      workingNow: "Waiting for dependency graph repair.",
      nextSteps: "Fix dependency overrides or node mapping and then reopen task.",
      blockers: "dependency_deadlock",
    });
    return false;
  }

  if (blockedCount > 0 && runningCount === 0 && runnableCount === 0) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "blocked",
      agentId: chief?._id,
      agentName: chief?.name || config.chiefAgentName,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "errored",
      reviewStatus: "pending",
      nextAction:
        `PM graph blocked: ${blockedCount} node(s) are blocked/failed with no runnable or running nodes. ` +
        `Chief recovery remains active.`,
    });
    return false;
  }

  const currentlyRunning = runningCount > 0 || runnableCount > 0 || dependencyWaitCount > 0;
  if (currentlyRunning && String(task.status) !== "in_progress") {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "in_progress",
      agentId: chief?._id,
      agentName: chief?.name || config.chiefAgentName,
    });
  }

  if (blockedCount > 0) {
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "executing",
      reviewStatus: "pending",
      nextAction: `PM graph has ${blockedCount} blocked node(s); chief recovery active`,
    });
  } else {
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "executing",
      reviewStatus: "pending",
      nextAction: `PM graph progress: running=${runningCount}, runnable=${runnableCount}, waiting=${dependencyWaitCount}`,
    });
  }
  return false;
}

function chooseSpecialists(task, agents) {
  const has = (name) => agents.find((a) => a.name === name);
  const workflowKind = resolveTaskWorkflowKind(task);
  const workflow = getWorkflowDefinition(workflowKind);
  const sequence = (workflow.steps || [])
    .filter((step) => step.role === "specialist")
    .map((step) => has(step.agentName))
    .filter(Boolean);
  if (sequence.length > 0) return sequence;

  // Hard fallback (should be rare): resolve to canonical role agents only.
  const t = `${task.title}\n${task.description}\n${(task.labels || []).join(" ")}`.toLowerCase();
  const names = [];
  if (isImplementationTask(task)) names.push("Backend");
  if (/(incident|ticket|support|login|auth|access|permission|onboarding)/.test(t))
    names.push("Operations");
  if (/(latency|metrics|capacity|infrastructure|throughput|observability|kpi|reporting)/.test(t))
    names.push("Operations");
  if (/(runbook|stability|post-mortem|rollback|sla)/.test(t)) names.push("Operations");
  if (/(doc|documentation|guide|onboarding|write)/.test(t)) names.push("Documentation");
  if (/(ui|ux|layout|design)/.test(t)) names.push("Designer");
  if (/database|sqlite|schema|migration|query|sql/.test(t)) names.push("Database");
  if (names.length === 0) names.push("Backend");
  return [...new Set(names)].map((n) => has(n)).filter(Boolean);
}

function inferAcceptanceCriteria(task) {
  const workflowKind = resolveTaskWorkflowKind(task);
  const criteria = [...inferWorkflowAcceptanceCriteria(task, workflowKind)];
  if (/(runbook|doc|guide|documentation)/i.test(task.title + " " + task.description)) {
    criteria.push("A relevant document/runbook is attached or updated.");
  }
  if (/(incident|critical|urgent|bug|failure|outage)/i.test(task.title + " " + task.description)) {
    criteria.push("Root cause or validated workaround is recorded.");
  }
  return [...new Set(criteria)];
}

function formatDelegationQueue(specialists) {
  const names = (specialists ?? []).map((a) => a?.name).filter(Boolean);
  if (names.length === 0) return "No specialist selected";
  if (names.length === 1) return names[0];
  return names.join(" -> ");
}

function requiredProofForStep(task, role, agentName) {
  if (role === "reviewer") return "comment_summary";
  const workflowKind = resolveTaskWorkflowKind(task);
  const workflow = getWorkflowDefinition(workflowKind);
  const mapped = workflow.steps.find(
    (step) => String(step.agentName || "").toLowerCase() === String(agentName || "").toLowerCase()
  );
  if (role === "specialist" && taskRequiresOutputPathEvidence(task)) {
    // Coding/implementation tasks with explicit path requirements must use output_path gate.
    // Keep document-proof specialist workflows (for docs/incident playbooks) unchanged.
    if (mapped?.requiredProof === "document") return "document";
    return "output_path";
  }
  if (mapped?.requiredProof) {
    if (mapped.requiredProof === "output_path") return "output_path";
    if (mapped.requiredProof === "document") return "document";
    if (mapped.requiredProof === "comment_summary") return "comment_summary";
  }
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
      requiredProof: requiredProofForStep(task, "specialist", specialist.name),
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

function isTerminalAccountabilityStep(step) {
  const status = String(step?.status || "");
  if (["completed", "handed_off", "skipped"].includes(status)) return true;
  if (
    status === "waiting_handoff" &&
    (Boolean(step?.completedAt) || Boolean(step?.handoffAt) || Boolean(step?.handoffToAgentId))
  ) {
    return true;
  }
  return false;
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
  const normalizedPaths = [...new Set((paths || []).map((p) => String(p || "").trim()).filter(Boolean))];
  if (normalizedPaths.length > 0) {
    const preferred =
      normalizedPaths.find((candidate) => {
        try {
          const resolved = path.resolve(candidate);
          return isPathInsideDir(config.taskArtifactsRoot, resolved);
        } catch {
          return false;
        }
      }) || normalizedPaths[0];
    if (!artifactVerificationPersistenceUnsupported) {
      try {
        await m((api).tasks.touchArtifactVerification, {
          id: taskId,
          artifactLastVerifiedAt: Date.now(),
          artifactRootPath: preferred,
        });
      } catch (error) {
        const message = String(error?.message || error || "");
        if (
          /Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(
            message
          )
        ) {
          artifactVerificationPersistenceUnsupported = true;
          console.warn(
            "[artifact-proof] touchArtifactVerification unavailable on deployment; skipping verification persistence"
          );
        } else {
          throw error;
        }
      }
    }
  }
  const steps = await listAccountabilitySteps(taskId);
  const step = [...(steps || [])].find((entry) => Number(entry?.stepIndex ?? -1) === Number(stepIndex));
  const normalizedProofPaths = [...new Set((paths || []).map((p) => String(p || "").trim()).filter(Boolean))];
  await emitExecutionEvent({
    taskId,
    actorAgentId: step?.agentId,
    actorName: step?.agentName || "Agent",
    actorRole: step?.role === "reviewer" ? "reviewer" : "specialist",
    kind: "proof",
    severity: normalizedProofPaths.length > 0 || String(summary || "").trim() ? "success" : "warning",
    title: `${step?.agentName || "Agent"} proof recorded`,
    summary: toEventSummary(summary || "Proof recorded for accountability step"),
    workDone: "Proof captured and attached to accountability step.",
    workingNow: `Step #${Number(stepIndex ?? 0)} status: ${String(step?.status || "running")}`,
    nextSteps:
      step?.role === "reviewer"
        ? "Finalize review decision."
        : "Proceed with handoff when gate conditions pass.",
    blockers: String(step?.stuckReason || ""),
    evidencePaths: normalizeEvidencePaths(normalizedProofPaths),
    relatedMessageId: proofMessageId,
    relatedStepId: step?._id,
    relatedRunId: dispatchRunId,
    detailsJson: {
      requiredProof: String(step?.requiredProof || "comment_summary"),
      stepIndex: Number(stepIndex ?? 0),
      proofDocumentCount: Array.isArray(proofDocumentIds) ? proofDocumentIds.length : 0,
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
  const steps = await listAccountabilitySteps(taskId);
  const fromStep = [...(steps || [])].find(
    (entry) => Number(entry?.stepIndex ?? -1) === Number(fromStepIndex)
  );
  const toStep = [...(steps || [])].find(
    (entry) => Number(entry?.stepIndex ?? -1) === Number(toStepIndex)
  );
  await emitExecutionEvent({
    taskId,
    actorAgentId: undefined,
    actorName: handoffBy || config.chiefAgentName,
    actorRole: "chief",
    kind: "handoff",
    severity: handoffValid ? "success" : "warning",
    title: `Handoff ${handoffValid ? "completed" : "flagged"}`,
    summary: `Step #${Number(fromStepIndex)} → #${Number(toStepIndex)} (${fromStep?.agentName || "unknown"} → ${toStep?.agentName || "unknown"})`,
    workDone: "Accountability handoff recorded.",
    workingNow: toStep
      ? `${toStep.agentName} (${toStep.role}) is next in workflow.`
      : "Waiting for next workflow step.",
    nextSteps: handoffValid ? "Continue execution on next step." : "Resolve handoff issues before continuing.",
    blockers: handoffValid ? "" : "Handoff marked invalid by gate validation.",
    relatedStepId: toStep?._id,
    evidencePaths: normalizeEvidencePaths(fromStep?.proofPaths || []),
    detailsJson: {
      handoffBy,
      fromStepIndex: Number(fromStepIndex),
      toStepIndex: Number(toStepIndex),
      handoffValid: Boolean(handoffValid),
    },
  });
}

async function completeAccountabilityStep(taskId, stepIndex, summary) {
  if (!config.accountabilityLedgerEnabled) return;
  await m((api).accountability.completeStep, {
    taskId,
    stepIndex,
    summary,
  });
  const steps = await listAccountabilitySteps(taskId);
  const step = [...(steps || [])].find((entry) => Number(entry?.stepIndex ?? -1) === Number(stepIndex));
  await emitExecutionEvent({
    taskId,
    actorAgentId: step?.agentId,
    actorName: step?.agentName || "Agent",
    actorRole: step?.role === "reviewer" ? "reviewer" : "specialist",
    kind: step?.role === "reviewer" ? "review" : "proof",
    severity: "success",
    title: `${step?.agentName || "Agent"} step completed`,
    summary: toEventSummary(summary || `Step #${Number(stepIndex)} completed`),
    workDone: "Accountability step marked as completed.",
    workingNow: "",
    nextSteps: "Proceed to next workflow stage.",
    blockers: "",
    evidencePaths: normalizeEvidencePaths(step?.proofPaths || []),
    relatedStepId: step?._id,
    detailsJson: {
      stepIndex: Number(stepIndex),
      role: String(step?.role || ""),
    },
  });
}

async function rewriteStepAssignee(taskId, steps = [], stepIndex, agent) {
  if (!config.accountabilityLedgerEnabled || !agent?._id) return;
  const normalized = [...(steps || [])]
    .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))
    .map((step) => ({
      stepIndex: Number(step.stepIndex ?? 0),
      agentId:
        Number(step.stepIndex ?? 0) === Number(stepIndex)
          ? agent._id
          : step.agentId,
      agentName:
        Number(step.stepIndex ?? 0) === Number(stepIndex)
          ? agent.name
          : step.agentName,
      role: step.role,
      requiredProof: step.requiredProof,
    }));
  if (normalized.length === 0) return;
  await m((api).accountability.initTaskWorkflow, {
    taskId,
    steps: normalized,
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

function reasonCode(reason = "") {
  return String(reason || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

const TRANSIENT_DISPATCH_FAILURE_PATTERNS = [
  /rate[_\s-]?limit/i,
  /provider .* cooldown/i,
  /all profiles unavailable/i,
  /temporar(?:y|ily) unavailable/i,
  /timeout|timed out|etimedout/i,
  /econnreset|econnrefused|enotfound|network/i,
  /429/,
];

function isTransientDispatchFailureText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  return TRANSIENT_DISPATCH_FAILURE_PATTERNS.some((pattern) => pattern.test(value));
}

function isTransientDispatchFailureReason(reason = "") {
  const code = reasonCode(reason);
  if (!["dispatch_failed", "dispatch_exception", "agent_unavailable", "no_assignee_progress"].includes(code)) {
    return false;
  }
  return isTransientDispatchFailureText(reason);
}

function runMatchesExecutionNode(run = {}, node = {}) {
  if (String(run.dispatchType || "").toLowerCase() !== "execution") return false;
  const runAgent = String(run.agentName || "").trim().toLowerCase();
  const nodeAgent = String(node.agentName || "").trim().toLowerCase();
  if (runAgent && nodeAgent && runAgent === nodeAgent) return true;
  const summary = `${String(run.inputSummary || "")} ${String(run.outputSummary || "")}`.toLowerCase();
  const nodeNameToken = String(node.agentName || "").trim().toLowerCase();
  const nodeKeyToken = String(node.nodeKey || "").trim().toLowerCase();
  return (
    (nodeNameToken && summary.includes(nodeNameToken)) ||
    (nodeKeyToken && summary.includes(nodeKeyToken))
  );
}

function hasActiveExecutionRunForNode(taskRuns = [], node = {}) {
  const nodeRuns = (taskRuns || []).filter((run) => runMatchesExecutionNode(run, node));
  if (nodeRuns.length === 0) return false;
  const byLifecycleDesc = [...nodeRuns].sort((a, b) => {
    const aLifecycle = Number(a.finishedAt ?? a.startedAt ?? a._creationTime ?? 0);
    const bLifecycle = Number(b.finishedAt ?? b.startedAt ?? b._creationTime ?? 0);
    if (aLifecycle !== bLifecycle) return bLifecycle - aLifecycle;
    return Number(b._creationTime ?? 0) - Number(a._creationTime ?? 0);
  });
  const latest = byLifecycleDesc[0];
  if (!latest) return false;
  return String(latest.status || "").toLowerCase() === "running";
}

function latestFailedExecutionRunForNode(taskRuns = [], node = {}) {
  return (
    (taskRuns || [])
      .filter(
        (run) =>
          runMatchesExecutionNode(run, node) &&
          String(run.status || "").toLowerCase() === "failed"
      )
      .sort(
        (a, b) =>
          Number(b.finishedAt ?? b._creationTime ?? 0) - Number(a.finishedAt ?? a._creationTime ?? 0)
      )[0] || null
  );
}

function reasonMessage(reason = "") {
  const code = reasonCode(reason);
  if (code === "artifact_path_not_found") {
    return "Blocked: canonical artifact folder path is missing on disk.";
  }
  if (code === "artifact_folder_empty") {
    return "Blocked: canonical artifact folder exists, but no verifiable deliverable files were found.";
  }
  if (code === "missing_output_path") {
    return "Blocked: assignee must provide verifiable deliverable files in the canonical Artifact Folder before review.";
  }
  if (code === "output_path_not_found") {
    return "Blocked: assignee reported an Output Path/Stored Location, but the path does not exist on disk.";
  }
  if (code === "output_path_empty") {
    return "Blocked: assignee reported an Output Path/Stored Location, but no verifiable deliverable files exist at that path.";
  }
  if (code === "no_assignee_progress") {
    return "Blocked: assignee progress is stale; concrete implementation evidence is required.";
  }
  if (code === "dispatch_failed") {
    return "Blocked: specialist dispatch failed; investigate runtime/agent connectivity and retry.";
  }
  if (code === "agent_unavailable") {
    return "Blocked: target agent is currently unavailable; queue until current active task finishes.";
  }
  if (code === "invalid_worklog_schema") {
    return "Blocked: assignee must post a valid structured worklog before handoff/review.";
  }
  if (code === "no_verifiable_file_evidence") {
    return "Blocked: assignee reported file evidence, but none of the referenced files exist on disk.";
  }
  return "Blocked by accountability policy; assignee evidence is required before resume.";
}

function isInvalidOutputPathIssue(code = "") {
  const normalized = String(code || "").trim().toLowerCase();
  return (
    normalized === "output_path_not_found" ||
    normalized === "output_path_empty" ||
    normalized === "artifact_path_not_found" ||
    normalized === "artifact_folder_empty"
  );
}

function isDispatchRetryCooldownReason(reason = "") {
  return reasonCode(reason) === "dispatch_retry_cooldown";
}

function nodeRetryCooldownRemainingMs(node = {}, now = Date.now()) {
  if (!isDispatchRetryCooldownReason(node?.stuckReason || "")) return 0;
  const updatedAt = Number(node?.updatedAt ?? node?.lastProgressAt ?? 0);
  if (!updatedAt) return 0;
  const cooldownMs = Math.max(15_000, Number(config.blockedRecoveryCooldownMs || 120_000));
  const elapsed = Math.max(0, now - updatedAt);
  return Math.max(0, cooldownMs - elapsed);
}

function isNodeInDispatchCooldown(node = {}, now = Date.now()) {
  return nodeRetryCooldownRemainingMs(node, now) > 0;
}

const AUTO_RECOVERABLE_BLOCK_REASONS = new Set([
  "artifact_path_not_found",
  "artifact_folder_empty",
  "invalid_worklog_schema",
  "no_assignee_progress",
  "no_verifiable_file_evidence",
  "missing_output_path",
  "output_path_not_found",
  "output_path_empty",
  "dispatch_failed",
  "agent_unavailable",
]);

const NON_TERMINAL_RECOVERY_CODES = new Set([
  "artifact_path_not_found",
  "artifact_folder_empty",
  "invalid_worklog_schema",
  "no_assignee_progress",
  "no_verifiable_file_evidence",
  "missing_output_path",
  "output_path_not_found",
  "output_path_empty",
  "agent_unavailable",
  "dispatch_failed",
]);

const RECOVERY_REASSIGNABLE_CODES = new Set([
  "artifact_path_not_found",
  "artifact_folder_empty",
  "invalid_worklog_schema",
  "no_assignee_progress",
  "no_verifiable_file_evidence",
  "missing_output_path",
  "output_path_not_found",
  "output_path_empty",
  "agent_unavailable",
]);

function hasRequiredProofForStep(step) {
  const required = String(step?.requiredProof || "comment_summary");
  const hasSummary =
    Boolean(step?.proofSummary) ||
    Boolean(step?.proofMessageId) ||
    (step?.proofDocumentIds?.length ?? 0) > 0;
  const hasPath = (step?.proofPaths ?? []).some((candidate) =>
    pathHasVerifiableArtifact(String(candidate || ""))
  );
  const hasDocument = (step?.proofDocumentIds?.length ?? 0) > 0;
  if (required === "none") return true;
  if (required === "output_path") return hasPath;
  if (required === "document") return hasDocument;
  return hasSummary;
}

function deriveOutputPathEvidenceFailure(evidence, fallbackMessage = "final specialist output path evidence not present") {
  const verifiableOutputPaths = [
    ...new Set(
      (evidence?.outputPaths ?? [])
        .map((p) => String(p || "").trim())
        .filter((p) => p && pathHasVerifiableArtifact(p))
    ),
  ];
  if (verifiableOutputPaths.length > 0) {
    return null;
  }

  if (config.autoTaskArtifactsEnabled) {
    const artifactRootPath = String(evidence?.artifactRootPath || "").trim();
    if (artifactRootPath) {
      if (!evidence?.artifactRootExists) {
        return {
          code: "artifact_path_not_found",
          reason: `artifact_path_not_found: canonical artifact path does not exist on disk (${artifactRootPath})`,
        };
      }
      if (!evidence?.artifactRootHasFiles) {
        return {
          code: "artifact_folder_empty",
          reason: `artifact_folder_empty: canonical artifact path has no verifiable deliverable files (${artifactRootPath})`,
        };
      }
    }
  }
  const reported = [...new Set((evidence?.reportedOutputPaths ?? []).map((p) => String(p || "").trim()).filter(Boolean))];
  const missing = [...new Set((evidence?.missingOutputPaths ?? []).map((p) => String(p || "").trim()).filter(Boolean))];
  const empty = [...new Set((evidence?.emptyOutputPaths ?? []).map((p) => String(p || "").trim()).filter(Boolean))];
  if (empty.length > 0) {
    const sample = empty.slice(0, 3).join(", ");
    return {
      code: "output_path_empty",
      reason: sample
        ? `output_path_empty: reported output path exists but has no verifiable deliverable files (${sample})`
        : "output_path_empty: reported output path exists but has no verifiable deliverable files",
    };
  }
  if (reported.length > 0) {
    const hasMissingOnly = missing.length === reported.length && missing.length > 0;
    if (hasMissingOnly) {
      const sample = missing.slice(0, 3).join(", ");
      return {
        code: "output_path_not_found",
        reason: sample
          ? `output_path_not_found: reported output path does not exist on disk (${sample})`
          : "output_path_not_found: reported output path does not exist on disk",
      };
    }
    const hasEmptyOnly = empty.length === reported.length && empty.length > 0;
    if (hasEmptyOnly) {
      const sample = empty.slice(0, 3).join(", ");
      return {
        code: "output_path_empty",
        reason: sample
          ? `output_path_empty: reported output path exists but has no verifiable deliverable files (${sample})`
          : "output_path_empty: reported output path exists but has no verifiable deliverable files",
      };
    }
    const sample = [...new Set([...missing, ...empty, ...reported])].slice(0, 3).join(", ");
    return {
      code: "no_verifiable_file_evidence",
      reason: sample
        ? `no_verifiable_file_evidence: reported output evidence is not verifiable on disk (${sample})`
        : "no_verifiable_file_evidence: reported output evidence is not verifiable on disk",
    };
  }
  return {
    code: "missing_output_path",
    reason: `missing_output_path: ${fallbackMessage}`,
  };
}

function latestAssigneeMessage(messages = [], assignee) {
  const assigneeName = String(assignee?.name || "").toLowerCase();
  const assigneeId = String(assignee?._id || "");
  return [...(messages || [])].reverse().find((msg) => {
    const fromName = String(msg?.fromName || "").toLowerCase();
    const fromAgentId = String(msg?.fromAgentId || "");
    return (
      (assigneeName && fromName === assigneeName) ||
      (assigneeId && fromAgentId === assigneeId)
    );
  });
}

async function blockTaskWithStep({
  task,
  chief,
  stepIndex,
  reason,
  stepStatus = "blocked",
  nextAction,
  comment,
  nextCheckInMinutes = 5,
}) {
  const code = reasonCode(reason);
  await blockAccountabilityStep(task._id, stepIndex, reason, stepStatus);
  await m(api.tasks.updateStatus, {
    id: task._id,
    status: "blocked",
    agentId: chief?._id,
    agentName: chief?.name,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "errored",
    reviewStatus: task.reviewStatus ?? "pending",
    nextAction: nextAction || reasonMessage(reason),
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + nextCheckInMinutes * 60 * 1000,
    nextAction: nextAction || reasonMessage(reason),
    chiefAgentId: chief?._id,
  });
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: chief?._id,
    fromName: chief?.name || config.chiefAgentName,
    kind: "system",
    stepIndex,
    workflowKind: resolveTaskWorkflowKind(task),
    content:
      comment ||
      `Chief block (${code || "policy"}): ${reasonMessage(reason)} ` +
        `Recovery: assignee must post concrete evidence and then task can be reopened.`,
  });
  await emitExecutionEvent({
    taskId: task._id,
    actorAgentId: chief?._id,
    actorName: chief?.name || config.chiefAgentName,
    actorRole: "chief",
    kind:
      code === "dispatch_failed" || code === "agent_unavailable" ? "recovery" : "proof",
    severity: "error",
    title: `Task blocked: ${normalizedTaskTitle(task)}`,
    summary: `Step #${Number(stepIndex ?? 0)} blocked (${code || "policy"})`,
    workDone: "Chief enforced proof/reliability gate.",
    workingNow: "Task moved to blocked state.",
    nextSteps: nextAction || reasonMessage(reason),
    blockers: String(reason || "").trim(),
    detailsMarkdown:
      `### Block Transition\n` +
      `- Task: #${String(task._id)} ${normalizedTaskTitle(task)}\n` +
      `- Step: ${Number(stepIndex ?? 0)}\n` +
      `- Reason: ${String(reason || "").trim()}\n` +
      `- Next: ${nextAction || reasonMessage(reason)}\n\n` +
      (comment ? `### Chief Comment\n${comment}` : ""),
  });
}

async function hasFreshAssigneeEvidenceSinceFailedReview(task) {
  if (String(task?.reviewStatus || "") !== "changes_requested") return true;
  try {
    const latest = await q((api).reviews.latestByTask, { taskId: task._id });
    if (!latest || String(latest.status || "") !== "fail") return true;
    const reviewedAt = Number(latest.reviewedAt ?? latest._creationTime ?? 0);
    const lastAssigneeUpdateAt = Number(task?.lastAssigneeUpdateAt ?? 0);
    return lastAssigneeUpdateAt > reviewedAt;
  } catch (error) {
    console.warn(
      `[review] failed to evaluate fresh-assignee-evidence for ${String(task?._id || "")}: ${String(
        error?.message || error
      )}`
    );
    return true;
  }
}

async function handoffReviewerFeedbackToSpecialist({ task, agents, reviewerStep, summary, findings }) {
  const chief = agents.byName.get(config.chiefAgentName);
  if (!chief) return;

  const workflowKind = resolveTaskWorkflowKind(task);
  const steps = await listAccountabilitySteps(task._id);
  const specialistSteps = [...(steps ?? [])]
    .filter((step) => step.role === "specialist")
    .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));

  const currentAssigneeId = String((task.assigneeIds ?? [])[0] || "");
  const mappedStep =
    specialistSteps.find((step) => String(step.agentId) === currentAssigneeId) ||
    specialistSteps[specialistSteps.length - 1] ||
    null;
  const specialist =
    (mappedStep ? agents.byId.get(String(mappedStep.agentId)) : null) ||
    chooseSpecialists(task, agents.list)[0];
  if (!specialist) return;

  const targetStepIndex = Number(mappedStep?.stepIndex ?? 0);
  const findingsLines = (findings ?? [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const findingsBlock = findingsLines.length > 0 ? `\n\nReviewer findings:\n- ${findingsLines.join("\n- ")}` : "";

  const specialistBusyElsewhere = await agentHasRunningWorkElsewhere(specialist, task._id);
  if (specialistBusyElsewhere) {
    await m(api.tasks.assign, {
      id: task._id,
      assigneeIds: [specialist._id],
      agentName: chief.name,
    });
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "assigned",
      agentId: chief._id,
      agentName: chief.name,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "assigned",
      reviewStatus: "changes_requested",
      nextAction: `Reviewer requested changes. ${specialist.name} is queued for rework when available.`,
    });
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: Date.now() + 2 * 60 * 1000,
      nextAction: `Queued for ${specialist.name}: reviewer feedback rework pending availability`,
      chiefAgentId: chief._id,
    });
    await m((api).messages.create, {
      taskId: task._id,
      fromAgentId: chief._id,
      fromName: chief.name,
      kind: "handoff",
      stepIndex: targetStepIndex,
      workflowKind,
      content:
        `Chief handoff after reviewer rejection: ${specialist.name} selected for rework, ` +
        `but is currently busy on another task. Task queued until availability.` +
        `\n\nReviewer summary: ${summary}${findingsBlock}`,
    });
    return;
  }

  const started = await ensureRunningStepStart(task._id, targetStepIndex, specialist._id);
  if (!started?.ok) {
    await m(api.tasks.assign, {
      id: task._id,
      assigneeIds: [specialist._id],
      agentName: chief.name,
    });
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "assigned",
      agentId: chief._id,
      agentName: chief.name,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "assigned",
      reviewStatus: "changes_requested",
      nextAction: `Reviewer requested changes. Waiting to start ${specialist.name} rework step (${String(
        started?.reason || "step_lock"
      )}).`,
    });
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: Date.now() + 2 * 60 * 1000,
      nextAction: `Waiting step-start lock release for ${specialist.name} rework`,
      chiefAgentId: chief._id,
    });
    await m((api).messages.create, {
      taskId: task._id,
      fromAgentId: chief._id,
      fromName: chief.name,
      kind: "handoff",
      stepIndex: targetStepIndex,
      workflowKind,
      content:
        `Chief handoff after reviewer rejection: unable to start ${specialist.name} step yet ` +
        `(${String(started?.reason || "unknown")}).` +
        `\n\nReviewer summary: ${summary}${findingsBlock}`,
    });
    return;
  }

  await m(api.tasks.assign, {
    id: task._id,
    assigneeIds: [specialist._id],
    agentName: chief.name,
  });
  await m(api.tasks.updateStatus, {
    id: task._id,
    status: "in_progress",
    agentId: chief._id,
    agentName: chief.name,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "executing",
    reviewStatus: "changes_requested",
    nextAction: `Reviewer requested changes. ${specialist.name} is reworking with reviewer feedback.`,
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + 2 * 60 * 1000,
    nextAction: `Execution in progress by ${specialist.name} after reviewer feedback`,
    chiefAgentId: chief._id,
  });
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: chief._id,
    fromName: chief.name,
    kind: "handoff",
    stepIndex: targetStepIndex,
    workflowKind,
    content:
      `Chief handoff after reviewer rejection: assigned ${specialist.name} for rework.` +
      `\n\nReviewer summary: ${summary}${findingsBlock}` +
      `\n\nRequired next update: post structured worklog with concrete evidence` +
      `${taskRequiresOutputPathEvidence(task) ? " in the canonical auto-managed Artifact Folder" : ""}.`,
  });

  if (reviewerStep) {
    await m((api).accountability.handoffStep, {
      taskId: task._id,
      fromStepIndex: Number(reviewerStep.stepIndex),
      toStepIndex: targetStepIndex,
      handoffBy: chief.name,
      handoffValid: true,
    });
  }
}

async function reconcileTaskStepConsistency(task, chief) {
  if (!config.accountabilityLedgerEnabled || !config.taskStepStateReconcile) return;
  if (isChiefPmParallelTask(task)) return;
  const steps = await listAccountabilitySteps(task._id);
  if ((steps || []).length === 0) return;
  const status = String(task.status || "");
  const activeExecutionStatus = new Set(["assigned", "in_progress", "review", "waiting"]);
  if (!activeExecutionStatus.has(status) && status !== "blocked") return;
  const running = steps.find((step) => step.status === "running");
  const blocked = steps.find((step) => step.status === "blocked" || step.status === "failed");
  const actionableSteps = steps.filter((step) => !isTerminalAccountabilityStep(step));
  const waitingIncomplete = steps.find(
    (step) =>
      step.status === "waiting_handoff" &&
      !isTerminalAccountabilityStep(step) &&
      !hasRequiredProofForStep(step)
  );
  const waitingReady = steps.find(
    (step) =>
      step.status === "waiting_handoff" &&
      !isTerminalAccountabilityStep(step) &&
      hasRequiredProofForStep(step)
  );

  if (activeExecutionStatus.has(status) && !running && actionableSteps.length === 0) {
    const minStepIndex = Math.min(...steps.map((step) => Number(step.stepIndex ?? 0)));
    await blockTaskWithStep({
      task,
      chief,
      stepIndex: Number.isFinite(minStepIndex) ? minStepIndex : 0,
      reason: "no_assignee_progress: workflow state is inconsistent (all steps terminal but task not done)",
      nextAction:
        "Blocked: workflow state became inconsistent after late evidence updates; specialist rework step will be restarted automatically",
      comment:
        "Chief reconciliation: task had no running/actionable step because all accountability rows were terminal while task remained active. " +
        "Task moved to blocked for deterministic self-recovery.",
    });
    return;
  }

  if (activeExecutionStatus.has(status) && !running && waitingIncomplete) {
    const required = String(waitingIncomplete.requiredProof || "comment_summary");
    const reason =
      required === "output_path"
        ? "artifact_folder_empty: waiting_handoff step lacks verifiable canonical Artifact Folder evidence"
        : required === "document"
          ? "no_assignee_progress: waiting_handoff step lacks required document evidence"
          : "no_assignee_progress: waiting_handoff step lacks required summary evidence";
    await blockTaskWithStep({
      task,
      chief,
      stepIndex: Number(waitingIncomplete.stepIndex ?? 0),
      reason,
      nextAction:
        required === "output_path"
          ? `Blocked: ${waitingIncomplete.agentName} must provide verifiable Artifact Folder evidence before handoff`
          : `Blocked: ${waitingIncomplete.agentName} must complete required evidence before handoff`,
      comment:
        `Chief reconciliation: step ${waitingIncomplete.stepIndex} (${waitingIncomplete.agentName}) was in waiting_handoff ` +
        `without required proof (${required}). Task moved to blocked until evidence is complete.`,
    });
    return;
  }

  if (activeExecutionStatus.has(status) && !running && blocked) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "blocked",
      agentId: chief?._id,
      agentName: chief?.name,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "errored",
      reviewStatus: task.reviewStatus ?? "pending",
      nextAction:
        task.nextAction ||
        `Blocked by accountability reconciliation: ${blocked.agentName} (${reasonCode(
          blocked.stuckReason || "blocked"
        )})`,
    });
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: Date.now() + 5 * 60 * 1000,
      nextAction:
        task.nextAction ||
        `Blocked by accountability reconciliation: ${blocked.agentName} step is blocked`,
      chiefAgentId: chief?._id,
    });
    await m((api).messages.create, {
      taskId: task._id,
      fromAgentId: chief?._id,
      fromName: chief?.name || config.chiefAgentName,
      content:
        `Chief reconciliation: task status corrected to blocked because no running step exists ` +
        `and step ${blocked.stepIndex} (${blocked.agentName}) is ${blocked.status}.`,
    });
    return;
  }

  if (activeExecutionStatus.has(status) && !running && !blocked && !waitingIncomplete) {
    if (waitingReady) {
      const ordered = [...steps].sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
      const terminalStepStatus = new Set(["completed", "handed_off", "skipped"]);
      const nextStep = ordered.find(
        (step) =>
          Number(step.stepIndex ?? 0) > Number(waitingReady.stepIndex ?? -1) &&
          !terminalStepStatus.has(String(step.status || ""))
      );
      if (nextStep) {
        await handoffAccountabilityStep(
          task._id,
          Number(waitingReady.stepIndex),
          Number(nextStep.stepIndex),
          chief?.name || config.chiefAgentName,
          true
        );
        if (
          String(nextStep.role) === "reviewer" &&
          nextStep.agentId &&
          String(nextStep.status || "") !== "completed"
        ) {
          await m((api).automation.submitForReview, {
            taskId: task._id,
            reviewerAgentId: nextStep.agentId,
            requesterAgentId: chief?._id,
            requesterAgentName: chief?.name || config.chiefAgentName,
            note:
              `Chief reconciliation: resumed waiting_handoff step ${waitingReady.stepIndex} and routed to reviewer.`,
          });
        } else {
          await m((api).automation.updateTaskAutomationState, {
            taskId: task._id,
            automationState: "executing",
            reviewStatus: task.reviewStatus ?? "pending",
            nextAction: `Reconciled handoff: moved step ${waitingReady.stepIndex} to ${nextStep.agentName}`,
          });
          await m((api).automation.setTaskNextCheck, {
            taskId: task._id,
            nextCheckAt: Date.now() + 2 * 60 * 1000,
            nextAction: `Execution resumed on step ${nextStep.stepIndex} by ${nextStep.agentName}`,
            chiefAgentId: chief?._id,
          });
        }
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief?._id,
          fromName: chief?.name || config.chiefAgentName,
          content:
            `Chief reconciliation: resumed pending handoff from step ${waitingReady.stepIndex} ` +
            `to step ${nextStep.stepIndex} (${nextStep.agentName}).`,
        });
        return;
      }
    }

    const specialistSteps = [...steps]
      .filter((step) => step.role === "specialist")
      .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
    const reviewerStep = steps.find((step) => step.role === "reviewer");
    const queuedSpecialist = specialistSteps.find((step) => step.status === "queued");
    const targetStep =
      (status === "review" &&
      reviewerStep &&
      String(reviewerStep.status || "") !== "completed"
        ? reviewerStep
        : null) ||
      queuedSpecialist ||
      specialistSteps[specialistSteps.length - 1] ||
      steps[0];
    if (targetStep?.agentId) {
      const restart = await ensureRunningStepStart(
        task._id,
        Number(targetStep.stepIndex),
        targetStep.agentId
      );
      if (restart?.ok) {
        if (String(targetStep.role) !== "reviewer" && status !== "in_progress") {
          await m(api.tasks.updateStatus, {
            id: task._id,
            status: "in_progress",
            agentId: chief?._id,
            agentName: chief?.name,
          });
        }
        await m((api).automation.updateTaskAutomationState, {
          taskId: task._id,
          automationState: "executing",
          reviewStatus: task.reviewStatus ?? "pending",
          nextAction: `Reconciled execution: resumed ${targetStep.agentName} on step ${targetStep.stepIndex}`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: Date.now() + 2 * 60 * 1000,
          nextAction: `Execution resumed on step ${targetStep.stepIndex} by ${targetStep.agentName}`,
          chiefAgentId: chief?._id,
        });
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief?._id,
          fromName: chief?.name || config.chiefAgentName,
          content:
            `Chief reconciliation: task had no running accountability step in in_progress state. ` +
            `Resumed ${targetStep.agentName} on step ${targetStep.stepIndex}.`,
        });
        return;
      }
      if (restart?.reason === "agent_busy") {
        await m(api.tasks.updateStatus, {
          id: task._id,
          status: "waiting",
          agentId: chief?._id,
          agentName: chief?.name,
        });
        await m((api).automation.updateTaskAutomationState, {
          taskId: task._id,
          automationState: "assigned",
          reviewStatus: task.reviewStatus ?? "changes_requested",
          nextAction: `Waiting: ${targetStep.agentName} is busy on another running task`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: Date.now() + 3 * 60 * 1000,
          nextAction: `Waiting for ${targetStep.agentName} availability`,
          chiefAgentId: chief?._id,
        });
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief?._id,
          fromName: chief?.name || config.chiefAgentName,
          content:
            `Chief reconciliation: step ${targetStep.stepIndex} queued because ${targetStep.agentName} is busy on another running task. ` +
            `Task moved to waiting and will auto-resume.`,
        });
        return;
      }
    }
    await blockTaskWithStep({
      task,
      chief,
      stepIndex: 0,
      reason: "no_assignee_progress: in_progress task had no running accountability step",
      nextAction: "Blocked: no runnable accountability step was available; specialist evidence required",
      comment:
        "Chief reconciliation: task was in_progress but no running/blocked/waiting step existed. Task moved to blocked for deterministic recovery.",
    });
    return;
  }

  if (task.status === "blocked" && running) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "in_progress",
      agentId: chief?._id,
      agentName: chief?.name,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "executing",
      reviewStatus: task.reviewStatus ?? "pending",
      nextAction:
        task.nextAction ||
        `Reconciled to in_progress: ${running.agentName} step ${running.stepIndex} is running`,
    });
    await m((api).messages.create, {
      taskId: task._id,
      fromAgentId: chief?._id,
      fromName: chief?.name || config.chiefAgentName,
      content:
        `Chief reconciliation: task status corrected to in_progress because step ${running.stepIndex} ` +
        `(${running.agentName}) is actively running.`,
    });
  }
}

async function reconcileDoneTaskAccountability(task, chief) {
  if (!config.accountabilityLedgerEnabled) return false;
  if (isChiefPmParallelTask(task)) return false;
  if (String(task?.status || "") !== "done") return false;

  const steps = await listAccountabilitySteps(task._id);
  if (!steps?.length) return false;
  const unsettled = steps.filter((step) => {
    const status = String(step?.status || "");
    return !["completed", "handed_off", "skipped"].includes(status);
  });
  if (unsettled.length === 0) return false;

  for (const step of unsettled) {
    await completeAccountabilityStep(
      task._id,
      Number(step.stepIndex ?? 0),
      "Done-state reconciliation: step normalized after terminal completion."
    );
  }

  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "completed",
    reviewStatus: task.reviewStatus ?? "approved",
    nextAction: "Completed and approved",
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + 24 * 60 * 60 * 1000,
    nextAction: "Completed and approved",
    chiefAgentId: chief?._id,
  });
  return true;
}

async function agentHasRunningWorkElsewhere(agent, currentTaskId) {
  if (!config.accountabilityLedgerEnabled || !agent?._id) return false;
  const rows = await q((api).accountability.currentByAgent, { agentId: agent._id });
  for (const row of rows ?? []) {
    if (String(row.status) !== "running") continue;
    if (String(row.taskId) === String(currentTaskId)) continue;
    try {
      const task = await q(api.tasks.get, { id: row.taskId });
      if (!task) continue;
      if (String(task.status || "") === "done") continue;
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function candidateRecoverySpecialists(task, agents, currentAgentId) {
  const pool = config.strictRoleRouting ? agents.list || [] : agents.all || [];
  const specialists = chooseSpecialists(task, pool);
  const fallback = pool.filter((agent) => {
    const name = String(agent?.name || "");
    if (!agent?._id) return false;
    if (String(agent._id) === String(currentAgentId)) return false;
    if (name === config.chiefAgentName || name === config.reviewerAgentName) return false;
    return true;
  });
  const ordered = [...specialists, ...fallback];
  const seen = new Set();
  const unique = [];
  for (const agent of ordered) {
    const id = String(agent?._id || "");
    if (!id || seen.has(id)) continue;
    if (id === String(currentAgentId)) continue;
    seen.add(id);
    unique.push(agent);
  }
  return unique;
}

async function findAvailableRecoverySpecialist(task, agents, currentAgentId) {
  const candidates = candidateRecoverySpecialists(task, agents, currentAgentId);
  for (const candidate of candidates) {
    if (!(await agentHasRunningWorkElsewhere(candidate, task._id))) {
      return candidate;
    }
  }
  return null;
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

function taskRequiresOutputPathEvidence(task) {
  const workflowKind = resolveTaskWorkflowKind(task);
  return requiresOutputPathEvidence(task, workflowKind);
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

function isPlausibleAbsolutePathCandidate(candidate = "") {
  const normalized = normalizeExtractedPath(candidate);
  if (!normalized.startsWith("/")) return false;
  if (normalized === "/absolute/path") return false;
  if (isIgnoredOutputEvidencePath(normalized)) return false;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  return true;
}

function extractAbsolutePathsFromText(text = "") {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  const pattern = /\/[^\s`"')\]\\]+/g;
  const found = new Set();
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const candidate = normalizeExtractedPath(match[0] || "");
    if (!isPlausibleAbsolutePathCandidate(candidate)) continue;
    found.add(candidate);
  }
  return [...found];
}

function extractStructuredEvidencePaths(text = "") {
  const body = String(text || "");
  if (!body.trim()) return [];
  const lines = body.split(/\r?\n/);
  const found = new Set();

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;

    const labeledPath = trimmed.match(
      /^(?:output path|stored location(?:\s+\d+)?|path|file|artifact)\s*:\s*(\/[^\s`"')\]\\]+)/i
    );
    if (labeledPath) {
      const candidate = normalizeExtractedPath(labeledPath[1] || "");
      if (isPlausibleAbsolutePathCandidate(candidate)) found.add(candidate);
      continue;
    }

    const bulletedLabeledPath = trimmed.match(
      /^[-*]\s*(?:output path|stored location(?:\s+\d+)?|path|file|artifact)\s*:\s*(\/[^\s`"')\]\\]+)/i
    );
    if (bulletedLabeledPath) {
      const candidate = normalizeExtractedPath(bulletedLabeledPath[1] || "");
      if (isPlausibleAbsolutePathCandidate(candidate)) found.add(candidate);
      continue;
    }

    const bareBulletedAbsolutePath = trimmed.match(/^[-*]\s*(\/[^\s`"')\]\\]+)/);
    if (bareBulletedAbsolutePath) {
      const candidate = normalizeExtractedPath(bareBulletedAbsolutePath[1] || "");
      if (isPlausibleAbsolutePathCandidate(candidate)) found.add(candidate);
      continue;
    }

    const numberedAbsolutePath = trimmed.match(/^\d+\.\s*(\/[^\s`"')\]\\]+)/);
    if (numberedAbsolutePath) {
      const candidate = normalizeExtractedPath(numberedAbsolutePath[1] || "");
      if (isPlausibleAbsolutePathCandidate(candidate)) found.add(candidate);
      continue;
    }
  }

  return [...found];
}

const ARTIFACT_INTERNAL_DOCS_DIR = "_mc_documents";
const ARTIFACT_INTERNAL_DOCS_INDEX = "_mc_documents_index.json";

function buildArtifactMirrorDocumentContent(doc = {}) {
  const title = String(doc?.title || "Untitled Document").trim();
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- Document ID: ${String(doc?._id || doc?.id || "")}`);
  lines.push(`- Type: ${String(doc?.type || "unknown")}`);
  lines.push(`- Created By: ${String(doc?.createdByName || "unknown")}`);
  if (doc?._creationTime) {
    lines.push(`- Created At: ${new Date(Number(doc._creationTime)).toISOString()}`);
  }
  lines.push(`- Mirrored At: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(String(doc?.content || "").trim() || "_empty_");
  lines.push("");
  return lines.join("\n");
}

function mirrorSingleTaskDocumentToArtifactRoot(task, doc = {}, forcedRoot = "") {
  const docId = String(doc?._id || doc?.id || "").trim();
  if (!docId) return null;
  const root = String(forcedRoot || "").trim() || resolveTaskArtifactRoot(task);
  if (!root) return null;
  fs.mkdirSync(root, { recursive: true });
  const docsDir = path.join(root, ARTIFACT_INTERNAL_DOCS_DIR);
  fs.mkdirSync(docsDir, { recursive: true });
  const titleSlug = slugifyTaskTitle(String(doc?.title || "document")) || "document";
  const fileName = `${docId}-${titleSlug}.md`;
  const filePath = path.join(docsDir, fileName);
  writeFileAtomic(filePath, buildArtifactMirrorDocumentContent(doc));
  return {
    docId,
    title: String(doc?.title || "Untitled Document"),
    filePath,
    fileName,
  };
}

function mirrorTaskDocumentsToArtifactRoot(task, taskDocs = []) {
  try {
    if (!config.autoTaskArtifactsEnabled) return { mirrored: 0, root: null, skipped: "artifacts_disabled" };
    const root = resolveTaskArtifactRoot(task);
    if (!root) return { mirrored: 0, root: null, skipped: "no_artifact_root" };
    fs.mkdirSync(root, { recursive: true });
    const docs = Array.isArray(taskDocs) ? taskDocs : [];
    if (docs.length === 0) {
      return { mirrored: 0, root, skipped: "no_documents" };
    }

    const entries = [];
    let mirrored = 0;
    for (const doc of docs) {
      try {
        const mirroredDoc = mirrorSingleTaskDocumentToArtifactRoot(task, doc, root);
        if (!mirroredDoc) continue;
        mirrored += 1;
        entries.push({
          id: mirroredDoc.docId,
          title: mirroredDoc.title,
          fileName: mirroredDoc.fileName,
          filePath: mirroredDoc.filePath,
        });
      } catch (error) {
        console.warn(
          `[deliverables] failed to mirror task document for task ${String(task?._id || "")}: ${String(error?.message || error)}`
        );
      }
    }

    const indexPayload = {
      generatedAt: Date.now(),
      generatedAtIso: new Date().toISOString(),
      taskId: String(task?._id || ""),
      taskTitle: String(task?.title || ""),
      source: "mission-control-orchestrator",
      internalSystemFilesExcludedFromProof: true,
      documents: entries,
    };
    writeFileAtomic(path.join(root, ARTIFACT_INTERNAL_DOCS_INDEX), `${JSON.stringify(indexPayload, null, 2)}\n`);
    return { mirrored, root, files: entries.map((entry) => entry.filePath) };
  } catch (error) {
    console.warn(
      `[deliverables] failed to mirror task documents for task ${String(task?._id || "")}: ${String(error?.message || error)}`
    );
    return { mirrored: 0, root: null, error: String(error?.message || error) };
  }
}

function isSystemGeneratedArtifactFile(candidate = "") {
  const normalized = path.normalize(String(candidate || ""));
  const base = path.basename(normalized).toLowerCase();
  const segments = normalized
    .split(path.sep)
    .map((segment) => String(segment || "").toLowerCase())
    .filter(Boolean);
  if (segments.includes(ARTIFACT_INTERNAL_DOCS_DIR.toLowerCase())) return true;
  return (
    base === "_mc_artifact_snapshot.md" ||
    base === "_mc_artifact_manifest.json" ||
    base === ARTIFACT_INTERNAL_DOCS_INDEX
  );
}

function pathHasVerifiableArtifact(candidate = "") {
  try {
    const resolved = path.resolve(String(candidate || ""));
    if (!isPathInsideDir(workspaceRoot, resolved)) return false;
    if (!fs.existsSync(resolved)) return false;
    const stat = fs.statSync(resolved);
    if (stat.isFile()) return !isSystemGeneratedArtifactFile(resolved);
    if (!stat.isDirectory()) return false;

    const stack = [resolved];
    let checked = 0;
    const maxEntries = 500;
    while (stack.length > 0 && checked < maxEntries) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        checked += 1;
        if (checked >= maxEntries) break;
        const nextPath = path.join(dir, entry.name);
        if (entry.isFile() && !isSystemGeneratedArtifactFile(nextPath)) return true;
        if (entry.isDirectory()) stack.push(nextPath);
      }
    }
  } catch {
    return false;
  }
  return false;
}

function writeFileAtomic(filePath, content) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function extractDeclaredOutputPathFromTask(task) {
  const corpus = `${task?.description || ""}\n${task?.intakeText || ""}\n${task?.title || ""}`;
  const pattern = /(?:output path|stored location)\s*:\s*(\/[^\s`"')\]\\]+)/gi;
  let match;
  while ((match = pattern.exec(corpus)) !== null) {
    const candidate = normalizeExtractedPath(match[1] || "");
    if (!isPlausibleAbsolutePathCandidate(candidate)) continue;
    try {
      const resolved = path.resolve(candidate);
      if (isPathInsideDir(workspaceRoot, resolved)) return resolved;
    } catch {
      // continue scanning
    }
  }
  return null;
}

function defaultTaskArtifactRoot(task) {
  const taskPrefix = `${String(task?._id || "task")}-${slugifyTaskTitle(task?.title || "")}`;
  const root = path.resolve(path.join(config.taskArtifactsRoot, taskPrefix));
  if (!isPathInsideDir(workspaceRoot, root)) return null;
  return root;
}

function resolveTaskArtifactRoot(task) {
  if (!config.autoTaskArtifactsEnabled) return null;
  const declared = String(task?.artifactRootPath || "").trim();
  if (declared.startsWith("/")) {
    try {
      const resolved = path.resolve(declared);
      if (isPathInsideDir(workspaceRoot, resolved)) return resolved;
    } catch {
      // fall back to deterministic task root
    }
  }
  return defaultTaskArtifactRoot(task);
}

async function ensureTaskArtifactRootReady(task) {
  const root = resolveTaskArtifactRoot(task);
  if (!root) return null;
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (error) {
    console.warn(
      `[deliverables] failed to prepare artifact root for task ${String(task?._id || "")}: ${String(error?.message || error)}`
    );
    return null;
  }
  const currentPath = String(task?.artifactRootPath || "").trim();
  const currentPolicy = String(task?.artifactPolicy || "").trim();
  if (!currentPath) task.artifactRootPath = root;
  if (!currentPolicy) task.artifactPolicy = "auto_managed";
  if (
    !artifactPathPersistenceUnsupported &&
    (currentPath !== root || currentPolicy !== "auto_managed") &&
    task?._id
  ) {
    try {
      await m((api).tasks.setArtifactRootPath, {
        id: task._id,
        artifactRootPath: root,
        artifactPolicy: "auto_managed",
      });
      task.artifactRootPath = root;
      task.artifactPolicy = "auto_managed";
    } catch (error) {
      const message = String(error?.message || error || "");
      if (/Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(message)) {
        artifactPathPersistenceUnsupported = true;
      }
      console.warn(
        `[deliverables] failed to persist artifact root for task ${String(task?._id || "")}: ${message}`
      );
    }
  }
  return root;
}

async function ensureRequiredOutputPathReady(task) {
  if (!taskRequiresOutputPathEvidence(task)) return null;
  if (config.autoTaskArtifactsEnabled) {
    const canonical = await ensureTaskArtifactRootReady(task);
    if (canonical) return canonical;
  }
  return ensureDeclaredOutputPathReady(task);
}

function detectOpenClawWorkspaceRoot() {
  if (openclawWorkspaceProbeComplete) return openclawWorkspaceRootCache;
  openclawWorkspaceProbeComplete = true;
  try {
    const args = [];
    if (config.openclawProfile) args.push("--profile", config.openclawProfile);
    args.push("config", "get", "agents.defaults.workspace", "--json");
    const result = spawnSync(config.openclawBin, args, {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 8000,
    });
    if (result.status !== 0) {
      console.warn(
        `[openclaw] workspace probe failed: ${String(result.stderr || result.stdout || "non-zero status")}`
      );
      return null;
    }
    const parsed = JSON.parse(String(result.stdout || "null"));
    const root = typeof parsed === "string" ? parsed.trim() : "";
    if (!root || !root.startsWith("/")) return null;
    openclawWorkspaceRootCache = path.resolve(root);
    return openclawWorkspaceRootCache;
  } catch (error) {
    console.warn(`[openclaw] workspace probe error: ${String(error?.message || error)}`);
    return null;
  }
}

function ensureAgentWritableArtifactPath(task, canonicalPath) {
  const canonical = String(canonicalPath || "").trim();
  if (!canonical.startsWith("/")) return canonicalPath;
  const openclawWorkspace = detectOpenClawWorkspaceRoot();
  if (!openclawWorkspace) return canonicalPath;
  if (isPathInsideDir(openclawWorkspace, canonical)) return canonicalPath;
  try {
    const bridgeRoot = path.join(openclawWorkspace, ".mission-control-artifacts");
    fs.mkdirSync(bridgeRoot, { recursive: true });
    const linkName = `${String(task?._id || "task")}-${path.basename(canonical)}`;
    const linkPath = path.join(bridgeRoot, linkName);
    try {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) {
        fs.rmSync(linkPath, { recursive: true, force: true });
      } else {
        const currentTarget = fs.readlinkSync(linkPath);
        const resolvedTarget = path.resolve(path.dirname(linkPath), currentTarget);
        if (resolvedTarget !== canonical) {
          fs.unlinkSync(linkPath);
        }
      }
    } catch {
      // no existing link
    }
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(canonical, linkPath, "dir");
    }
    return linkPath;
  } catch (error) {
    console.warn(
      `[deliverables] failed to prepare OpenClaw writable bridge for task ${String(task?._id || "")}: ${String(error?.message || error)}`
    );
    return canonicalPath;
  }
}

async function ensureAgentWritableOutputPathReady(task) {
  const canonical = await ensureRequiredOutputPathReady(task);
  if (!canonical) return null;
  return ensureAgentWritableArtifactPath(task, canonical);
}

function reportOpenClawWorkspaceCompatibility() {
  const openclawWorkspace = detectOpenClawWorkspaceRoot();
  if (!openclawWorkspace) {
    console.warn(
      "[openclaw] could not resolve agents.defaults.workspace; artifact writes rely on direct canonical path access"
    );
    return;
  }
  const directWriteCompatible = isPathInsideDir(openclawWorkspace, config.taskArtifactsRoot);
  if (directWriteCompatible) {
    console.log(
      `[openclaw] workspace compatibility: direct artifact writes enabled (${openclawWorkspace})`
    );
    return;
  }
  console.warn(
    `[openclaw] workspace mismatch detected: workspace=${openclawWorkspace}, artifacts=${config.taskArtifactsRoot}. ` +
      "Using writable symlink bridge under OpenClaw workspace for autonomous artifact recovery."
  );
}

function ensureDeclaredOutputPathReady(task) {
  const declared = extractDeclaredOutputPathFromTask(task);
  if (!declared) return null;
  try {
    const ext = path.extname(declared);
    const targetDir = ext ? path.dirname(declared) : declared;
    if (!isPathInsideDir(workspaceRoot, targetDir)) return null;
    fs.mkdirSync(targetDir, { recursive: true });
    return declared;
  } catch (error) {
    console.warn(
      `[deliverables] failed to prepare declared output path for task ${String(task?._id || "")}: ${String(error?.message || error)}`
    );
    return null;
  }
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
  if (!fs.existsSync(source)) return null;

  const taskRoot = resolveTaskArtifactRoot(task) || defaultTaskArtifactRoot(task);
  if (!taskRoot) return null;
  fs.mkdirSync(taskRoot, { recursive: true });
  const resolvedTaskRoot = path.resolve(taskRoot);

  // Bridge paths under OpenClaw workspace are symlink aliases for the canonical task artifact folder.
  // Treat canonical path as source-of-truth and never mirror bridge aliases recursively.
  const openclawWorkspace = detectOpenClawWorkspaceRoot();
  if (openclawWorkspace) {
    const bridgeRoot = path.join(openclawWorkspace, ".mission-control-artifacts");
    if (isPathInsideDir(bridgeRoot, source)) {
      return fs.existsSync(resolvedTaskRoot) ? resolvedTaskRoot : null;
    }
  }

  let effectiveSource = source;
  try {
    effectiveSource = fs.realpathSync(source);
  } catch {
    effectiveSource = source;
  }

  if (isPathInsideDir(resolvedTaskRoot, effectiveSource)) {
    return taskRoot;
  }
  if (isPathInsideDir(workspaceRoot, effectiveSource)) {
    return fs.existsSync(effectiveSource) ? effectiveSource : null;
  }
  if (!config.taskArtifactMirrorExternal) return null;

  const resolvedEffectiveSource = path.resolve(effectiveSource);
  if (resolvedEffectiveSource === resolvedTaskRoot) {
    return taskRoot;
  }

  const stat = fs.statSync(effectiveSource);
  if (stat.isDirectory()) {
    const destDir = path.join(taskRoot, path.basename(effectiveSource));
    const resolvedDestDir = path.resolve(destDir);
    if (resolvedDestDir === resolvedEffectiveSource) {
      return taskRoot;
    }
    if (resolvedDestDir.startsWith(`${resolvedEffectiveSource}${path.sep}`)) {
      return taskRoot;
    }
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    fs.cpSync(effectiveSource, destDir, { recursive: true, force: true });
    return taskRoot;
  }

  const destFile = path.join(taskRoot, path.basename(effectiveSource));
  fs.cpSync(effectiveSource, destFile, { force: true });
  return taskRoot;
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
    if (!pathHasVerifiableArtifact(finalPath)) continue;
    if (seen.has(finalPath)) continue;
    seen.add(finalPath);
    out.push(finalPath);
  }
  return out;
}

function buildEvidenceSnapshotMarkdown(task, assigneeMessages = [], assigneeDocs = [], reportedPaths = []) {
  const lines = [];
  lines.push(`# Mission Control Artifact Snapshot`);
  lines.push("");
  lines.push(`- Task ID: ${String(task?._id || "")}`);
  lines.push(`- Title: ${String(task?.title || "")}`);
  lines.push(`- Generated At: ${new Date().toISOString()}`);
  lines.push(`- Reason: Specialist evidence exists; captured snapshot into canonical artifact folder.`);
  lines.push("");
  if (reportedPaths.length > 0) {
    lines.push("## Reported Paths");
    for (const p of reportedPaths.slice(0, 30)) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }
  if (assigneeDocs.length > 0) {
    lines.push("## Assignee Documents");
    for (const doc of assigneeDocs.slice(0, 20)) {
      lines.push(`- ${String(doc?.title || "Untitled")} (${String(doc?._id || "")})`);
    }
    lines.push("");
  }
  if (assigneeMessages.length > 0) {
    lines.push("## Assignee Worklog / Evidence Messages");
    for (const msg of assigneeMessages.slice(-12)) {
      const header =
        `### ${String(msg?.fromName || "Agent")} ` +
        `(${msg?._creationTime ? new Date(msg._creationTime).toISOString() : "unknown-time"})`;
      lines.push(header);
      lines.push("");
      lines.push(String(msg?.content || "").trim() || "_empty_");
      lines.push("");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

function ensureAssigneeEvidenceSnapshot(task, assigneeMessages = [], assigneeDocs = [], reportedPaths = []) {
  try {
    const taskRoot = resolveTaskArtifactRoot(task);
    if (!taskRoot) return { wrote: false, root: null };
    fs.mkdirSync(taskRoot, { recursive: true });
    if (pathHasVerifiableArtifact(taskRoot)) {
      return { wrote: false, root: taskRoot, skipped: "already_has_files" };
    }
    if ((assigneeMessages?.length ?? 0) === 0 && (assigneeDocs?.length ?? 0) === 0) {
      return { wrote: false, root: taskRoot, skipped: "no_assignee_evidence" };
    }

    const snapshotMdPath = path.join(taskRoot, "_mc_artifact_snapshot.md");
    const manifestJsonPath = path.join(taskRoot, "_mc_artifact_manifest.json");
    const snapshotMd = buildEvidenceSnapshotMarkdown(
      task,
      assigneeMessages,
      assigneeDocs,
      reportedPaths
    );
    const manifest = {
      generatedAt: Date.now(),
      generatedAtIso: new Date().toISOString(),
      taskId: String(task?._id || ""),
      taskTitle: String(task?.title || ""),
      source: "mission-control-orchestrator",
      reason: "specialist_evidence_snapshot",
      assigneeMessageCount: Number(assigneeMessages?.length || 0),
      assigneeDocumentCount: Number(assigneeDocs?.length || 0),
      reportedPaths: [...new Set((reportedPaths || []).map((p) => String(p || "").trim()).filter(Boolean))],
      messageIds: assigneeMessages.map((m) => String(m?._id || "")).filter(Boolean),
      documentIds: assigneeDocs.map((d) => String(d?._id || "")).filter(Boolean),
    };
    writeFileAtomic(snapshotMdPath, snapshotMd);
    writeFileAtomic(manifestJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return { wrote: true, root: taskRoot, files: [snapshotMdPath, manifestJsonPath] };
  } catch (error) {
    console.warn(
      `[deliverables] failed to write assignee evidence snapshot for task ${String(task?._id || "")}: ${String(error?.message || error)}`
    );
    return { wrote: false, root: null, error: String(error?.message || error) };
  }
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
    if (!isPlausibleAbsolutePathCandidate(candidate)) continue;
    if (isIgnoredOutputEvidencePath(candidate)) continue;
    found.add(candidate);
  }
  return [...found];
}

function stripAnsi(text = "") {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "");
}

function collectOpenClawTexts(node, sink = []) {
  if (!node) return sink;
  if (Array.isArray(node)) {
    for (const item of node) collectOpenClawTexts(item, sink);
    return sink;
  }
  if (typeof node !== "object") return sink;

  const payloads = Array.isArray(node?.result?.payloads)
    ? node.result.payloads
    : Array.isArray(node?.payloads)
      ? node.payloads
      : [];
  for (const payload of payloads) {
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (text) sink.push(text);
  }

  const content = node?.message?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      if (item.type === "text" || item.type === "summary_text") {
        const text = String(item.text || "").trim();
        if (text) sink.push(text);
      }
    }
  }

  return sink;
}

function parseOpenClawPayloadTexts(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const collected = collectOpenClawTexts(parsed, []);
    if (collected.length > 0) return collected;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("runId" in parsed ||
        "status" in parsed ||
        "summary" in parsed ||
        "result" in parsed ||
        "meta" in parsed)
    ) {
      // Parsed as a machine envelope with no payload text.
      // Returning empty prevents line-wise fallback from turning metadata into fake worklogs.
      return [];
    }
  } catch {
    // fallback: line-wise parsing
  }

  const collected = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      collectOpenClawTexts(parsed, collected);
      continue;
    } catch {
      collected.push(trimmed);
    }
  }
  return collected;
}

function looksLikeOpenClawJsonEnvelope(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return false;
  const hasEnvelopeKeys =
    /"runId"\s*:|\"status\"\s*:|\"result\"\s*:|\"meta\"\s*:|\"agentMeta\"\s*:|\"systemPromptReport\"\s*:/i.test(
      text
    );
  const hasWorklogText = /###\s*Worklog\b|Objective:|Actions Taken:|Findings:|Evidence:|Next Handoff:/i.test(text);
  return hasEnvelopeKeys && !hasWorklogText;
}

function summarizeOpenClawRunOutput(result) {
  const raw = stripAnsi(`${result?.stdout || ""}\n${result?.stderr || ""}`);
  const parsedTexts = parseOpenClawPayloadTexts(raw);
  const sourceTexts =
    parsedTexts.length > 0 ? parsedTexts : looksLikeOpenClawJsonEnvelope(raw) ? [] : [raw];
  const lines = [];
  let structuredWorklog = "";

  for (const block of sourceTexts) {
    const text = String(block || "").trim();
    if (!text) continue;
    if (!structuredWorklog && isStructuredWorklog(text, { requirePath: false })) {
      structuredWorklog = text;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^\s*###\s*Worklog\b/i.test(trimmed)) continue;
      if (/^(Objective|Actions Taken|Findings|Evidence|Blockers|Next Handoff)\s*:/i.test(trimmed)) {
        continue;
      }
      lines.push(trimmed);
    }
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
    /^"name"\s*:\s*"memory_/i,
    /^"propertiescount"\s*:/i,
    /^"summarychars"\s*:/i,
    /^"schemachars"\s*:/i,
    /^"name"\s*:\s*"(subagents|session_status|web_search|web_fetch|image|agents_list|sessions_(list|history|send|spawn)|memory_(search|get))"/i,
    /^memory_(search|get)\b/i,
    /^-\s*"name"\s*:\s*"memory_/i,
    /^-\s*"propertiescount"\s*:/i,
    /^-\s*"summarychars"\s*:/i,
    /^-\s*"schemachars"\s*:/i,
    /^-\s*"name"\s*:\s*"(subagents|session_status|web_search|web_fetch|image|agents_list|sessions_(list|history|send|spawn)|memory_(search|get))"/i,
    /^"runid"\s*:/i,
    /^"status"\s*:/i,
    /^"summary"\s*:/i,
    /^"result"\s*:/i,
    /^"payloads"\s*:/i,
    /^"meta"\s*:/i,
    /^"agentmeta"\s*:/i,
    /^"provider"\s*:/i,
    /^"model"\s*:/i,
  ];

  const unique = [];
  const seen = new Set();
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const rawPathCandidate = normalizeExtractedPath(normalized.replace(/^[-*]\s*/, ""));
    if (isPlausibleAbsolutePathCandidate(rawPathCandidate)) continue;
    if (/^(?:output path|stored location(?:\s+\d+)?|artifact folder)\s*:\s*\/\S+/i.test(normalized)) {
      continue;
    }
    if (noise.some((re) => re.test(normalized))) continue;
    if (normalized.length < 3) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  const clipped = unique
    .slice(-6)
    .map((line) => (line.length > 240 ? `${line.slice(0, 237)}...` : line));
  const outputPaths = extractAbsolutePathEvidence(
    sourceTexts.map((content) => ({ content })),
    []
  );
  return {
    lines: clipped,
    outputPaths,
    worklogText: structuredWorklog || undefined,
  };
}

function inferReviewerDecisionSignal(...sources) {
  const text = sources
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!text) return "unknown";

  const rejectPatterns = [
    /\breview(?:er)?\s+verdict\s*:\s*(?:fail|failed|reject|rejected|changes[\s_-]*requested|request(?:ed)?\s+changes)\b/i,
    /\bverdict\s*:\s*(?:fail|failed|reject|rejected|changes[\s_-]*requested)\b/i,
    /\breviewer\s+requested\s+changes\b/i,
    /\bstatus\s*:\s*changes[\s_-]*requested\b/i,
    /\bthis is\s+\*{0,2}fail\*{0,2}\b/i,
    /\brejected\b/i,
  ];
  for (const pattern of rejectPatterns) {
    if (pattern.test(text)) return "reject";
  }

  const approvePatterns = [
    /\breview(?:er)?\s+verdict\s*:\s*(?:pass|approved?)\b/i,
    /\bverdict\s*:\s*(?:pass|approved?)\b/i,
    /\breviewer\s+approved\b/i,
    /\bstatus\s*:\s*approved\b/i,
  ];
  for (const pattern of approvePatterns) {
    if (pattern.test(text)) return "approve";
  }

  return "unknown";
}

function isNonActionableStatusAlignmentReject(...sources) {
  const text = sources
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (!text) return false;

  const hasStatusAlignmentOnlySignal =
    /(?:task|live)\s+status\s+alignment/.test(text) ||
    /status\s+field/.test(text) ||
    /not independently verifiable/.test(text) ||
    /cannot\s+independently\s+verif(?:y|iable)/.test(text) ||
    /not independently verifiable from here/.test(text);
  if (!hasStatusAlignmentOnlySignal) return false;

  const actionableSignals = [
    /artifact[_\s-]?folder[_\s-]?empty/,
    /artifact[_\s-]?path[_\s-]?not[_\s-]?found/,
    /output[_\s-]?path[_\s-]?not[_\s-]?found/,
    /missing[_\s-]?output[_\s-]?path/,
    /invalid[_\s-]?worklog/,
    /no[_\s-]?assignee[_\s-]?progress/,
    /dispatch[_\s-]?failed/,
    /agent[_\s-]?unavailable/,
    /\btraceback\b/,
    /\bexception\b/,
    /\bsyntax error\b/,
    /\bfailing tests?\b/,
    /\btests?\s+failed\b/,
  ];
  return !actionableSignals.some((pattern) => pattern.test(text));
}

function extractStructuredEvidencePathsFromRecords(records = []) {
  const found = new Set();
  for (const record of records || []) {
    const content = String(record?.content || "");
    for (const candidate of extractStructuredEvidencePaths(content)) {
      const normalized = normalizeExtractedPath(candidate);
      if (!isPlausibleAbsolutePathCandidate(normalized)) continue;
      found.add(normalized);
    }
  }
  return [...found];
}

async function relaySpecialistRunUpdate({
  taskId,
  task,
  specialist,
  result,
  stepIndex = 0,
  totalSteps = 1,
  workflowKind = "general",
  nextHandoff = "Reviewer",
}) {
  if (!specialist?._id) return false;
  const summary = summarizeOpenClawRunOutput(result);
  const outputPaths = ensureProjectLocalEvidencePaths(
    task ?? { _id: taskId, title: "task" },
    summary.outputPaths
  );
  const content =
    summary.worklogText && isStructuredWorklog(summary.worklogText, { requirePath: false })
      ? summary.worklogText
      : buildRelayWorklog({
          specialistName: specialist.name,
          stepIndex,
          totalSteps,
          summaryLines: summary.lines,
          outputPaths: outputPaths.slice(0, 5),
          nextHandoff,
          runFailed: result?.code !== 0,
          failCode: String(result?.code ?? "unknown"),
        });

  const messageId = await m((api).messages.create, {
    taskId,
    fromAgentId: specialist._id,
    fromName: specialist.name,
    content,
    kind: "worklog",
    stepIndex,
    workflowKind: resolveTaskWorkflowKind(task, workflowKindFromCommand(task?.workflowCommand) || workflowKind),
  });
  const sections = parseStructuredWorklogSections(content);
  await emitExecutionEvent({
    taskId,
    actorAgentId: specialist._id,
    actorName: specialist.name,
    actorRole: "specialist",
    kind: "worklog",
    severity: result?.code === 0 ? "success" : "warning",
    title: `${specialist.name} worklog update`,
    summary:
      toEventSummary(summary.lines.join(" | "), `Step ${stepIndex + 1}/${Math.max(totalSteps, stepIndex + 1)} worklog`) ||
      `${specialist.name} posted worklog`,
    workDone: sections.actionsTaken || sections.findings || "Worklog posted.",
    workingNow: sections.objective || "",
    nextSteps: sections.nextHandoff || nextHandoff,
    blockers: sections.blockers || "",
    evidencePaths: normalizeEvidencePaths(outputPaths),
    detailsMarkdown: content,
    relatedMessageId: messageId,
    detailsJson: {
      stepIndex,
      totalSteps,
      workflowKind: resolveTaskWorkflowKind(task, workflowKindFromCommand(task?.workflowCommand) || workflowKind),
      dispatchCode: Number(result?.code ?? 0),
    },
  });
  return true;
}

async function collectAssigneeEvidence(task, taskMessages = [], taskDocs = []) {
  const assigneeIds = (task?.assigneeIds ?? []).map(String);
  const assignees = await Promise.all(
    (task?.assigneeIds ?? []).map((id) => q(api.agents.get, { id }))
  );
  const assigneeNames = new Set(
    assignees.map((a) => String(a?.name || "").toLowerCase()).filter(Boolean)
  );
  const assigneeMessages = (taskMessages ?? []).filter((m) => {
    const fromName = String(m?.fromName || "").toLowerCase();
    const fromAgentId = String(m?.fromAgentId || "");
    return assigneeNames.has(fromName) || assigneeIds.includes(fromAgentId);
  });
  const assigneeDocs = (taskDocs ?? []).filter((doc) => {
    const createdBy = String(doc?.createdBy || "");
    return createdBy && assigneeIds.includes(createdBy);
  });

  return {
    assigneeIds,
    assignees,
    assigneeNames,
    assigneeMessages,
    assigneeDocs,
  };
}

async function inspectTaskEvidence(taskId) {
  const bundle = await internalContextProvider.getTaskBundle(taskId);
  const task = bundle.task;
  if (task && taskRequiresOutputPathEvidence(task) && config.autoTaskArtifactsEnabled) {
    await ensureTaskArtifactRootReady(task);
  }
  const taskMessages = bundle.messages;
  const taskDocs = bundle.documents;
  const mirroredDocs = mirrorTaskDocumentsToArtifactRoot(task, taskDocs);
  const { assigneeMessages, assigneeDocs } = await collectAssigneeEvidence(
    task,
    taskMessages,
    taskDocs
  );
  const assigneeStructuredWorklogs = assigneeMessages.filter((msg) =>
    isStructuredWorklog(String(msg?.content || ""), { requirePath: false })
  );
  const labeledOutputPaths = extractAbsolutePathEvidence(assigneeMessages, assigneeDocs);
  const structuredOutputPaths = extractStructuredEvidencePathsFromRecords([
    ...(assigneeMessages || []),
    ...(assigneeDocs || []),
  ]);
  const reportedOutputPaths = [
    ...new Set([...labeledOutputPaths, ...structuredOutputPaths].map((p) => String(p || "").trim()).filter(Boolean)),
  ];
  ensureAssigneeEvidenceSnapshot(
    task ?? { _id: taskId, title: "task" },
    assigneeMessages,
    assigneeDocs,
    reportedOutputPaths
  );
  const outputPaths = ensureProjectLocalEvidencePaths(
    task ?? { _id: taskId, title: "task" },
    reportedOutputPaths
  );
  const artifactRootPath = resolveTaskArtifactRoot(task);
  const artifactRootExists = artifactRootPath ? fs.existsSync(artifactRootPath) : false;
  const artifactRootHasFiles =
    artifactRootPath && artifactRootExists ? pathHasVerifiableArtifact(artifactRootPath) : false;
  const outputPathsWithCanonical = [...outputPaths];
  if (artifactRootPath && artifactRootHasFiles && !outputPathsWithCanonical.includes(artifactRootPath)) {
    outputPathsWithCanonical.push(artifactRootPath);
  }
  const missingOutputPaths = reportedOutputPaths.filter((p) => {
    try {
      return !fs.existsSync(path.resolve(String(p || "")));
    } catch {
      return true;
    }
  });
  const emptyOutputPaths = reportedOutputPaths.filter((p) => {
    try {
      const resolved = path.resolve(String(p || ""));
      return fs.existsSync(resolved) && !pathHasVerifiableArtifact(resolved);
    } catch {
      return false;
    }
  });
  return {
    taskMessages,
    taskDocs,
    hasEvidence: (taskMessages?.length ?? 0) > 0 || (taskDocs?.length ?? 0) > 0,
    hasAssigneeEvidence: assigneeMessages.length > 0 || assigneeDocs.length > 0,
    hasStructuredAssigneeEvidence: assigneeStructuredWorklogs.length > 0 || assigneeDocs.length > 0,
    outputPaths: outputPathsWithCanonical,
    reportedOutputPaths,
    labeledOutputPaths,
    structuredOutputPaths,
    missingOutputPaths,
    emptyOutputPaths,
    artifactRootPath,
    artifactRootExists,
    artifactRootHasFiles,
    mirroredDocuments: mirroredDocs,
  };
}

function listVerifiableArtifactFiles(rootPath = "", maxEntries = 2500) {
  const resolved = path.resolve(String(rootPath || ""));
  if (!resolved || !isPathInsideDir(workspaceRoot, resolved)) return [];
  if (!fs.existsSync(resolved)) return [];
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) {
    return isSystemGeneratedArtifactFile(resolved) ? [] : [resolved];
  }

  const files = [];
  const stack = [resolved];
  let scanned = 0;
  while (stack.length > 0 && scanned < maxEntries) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      scanned += 1;
      if (scanned > maxEntries) break;
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSystemGeneratedArtifactFile(nextPath)) continue;
      files.push(nextPath);
    }
  }
  return files;
}

function taskLooksSimpleRequest(task) {
  const title = String(task?.title || "");
  const description = String(task?.description || "");
  const intake = String(task?.intakeText || "");
  const text = `${title}\n${description}\n${intake}`.toLowerCase();
  return /\b(simple|basic|minimal|starter|demo|small|quick)\b/.test(text);
}

function countQualityAutofixAttempts(runs = [], agentName = "") {
  const normalizedAgent = String(agentName || "").trim().toLowerCase();
  return (runs || []).filter((run) => {
    if (String(run?.dispatchType || "") !== "quality_repair") return false;
    if (!normalizedAgent) return true;
    return String(run?.agentName || "").trim().toLowerCase() === normalizedAgent;
  }).length;
}

function buildQualityRepairPrompt({
  task,
  specialist,
  workflowKind,
  issues = [],
  requiredOutputPath = "",
  stepIndex = 0,
  totalSteps = 1,
  nextHandoff = "Reviewer",
}) {
  const normalizedIssues = [...new Set((issues || []).map((item) => String(item || "").trim()).filter(Boolean))];
  const pathText = String(requiredOutputPath || "").trim();
  return [
    `Mission Control auto-repair dispatch for task ${String(task?._id || "")}.`,
    `Agent: ${specialist?.name || "Specialist"}`,
    `Workflow: ${String(workflowKind || "general")}`,
    `Task: ${String(task?.title || "")}`,
    "",
    "Reason for rework:",
    ...(normalizedIssues.length > 0
      ? normalizedIssues.map((item) => `- ${item}`)
      : ["- Quality/proof gate failed and requires correction."]),
    "",
    "Mandatory fix loop (execute all):",
    "1. Diagnose all listed issues and patch implementation.",
    "2. Re-run validation/tests/manual checks and fix remaining defects.",
    "3. Ensure artifact folder contains real deliverable files (not placeholders).",
    "4. Post one structured worklog with concrete Evidence and Next Handoff.",
    "5. Do not leave known bugs unresolved.",
    "",
    pathText ? `Canonical Artifact Folder: ${pathText}` : "Canonical Artifact Folder: use task auto-managed artifact folder.",
    "",
    "Worklog schema (mandatory):",
    `### Worklog — ${specialist?.name || "Specialist"} — Step ${Number(stepIndex) + 1}/${Math.max(1, Number(totalSteps) || 1)}`,
    "Objective:",
    "Actions Taken:",
    "Findings:",
    "Evidence:",
    "Blockers:",
    `Next Handoff: ${String(nextHandoff || "Reviewer")}`,
  ].join("\n");
}

function evaluateImplementationQuality(task, evidenceSnapshot = {}) {
  if (!config.implementationQualityGateEnabled) {
    return { pass: true, skipped: "quality_gate_disabled", findings: [] };
  }
  if (!taskRequiresOutputPathEvidence(task)) {
    return { pass: true, skipped: "path_evidence_not_required", findings: [] };
  }

  const title = String(task?.title || "");
  const description = String(task?.description || "");
  const intakeText = String(task?.intakeText || "");
  const labels = Array.isArray(task?.labels)
    ? task.labels.map((label) => String(label || "").trim().toLowerCase())
    : [];
  const corpus = `${title}\n${description}\n${intakeText}`.toLowerCase();
  const smokeTask =
    labels.includes("smoke") || labels.includes("smoke-test") || /\bsmoke\b/i.test(corpus);
  const simpleTask = config.simpleTaskEnhancementEnabled && taskLooksSimpleRequest(task);
  const codeTask =
    /(flask|python|javascript|typescript|html|css|sql|sqlite|api|frontend|backend|database|crud|dashboard|website|app|implement|build|code)/i.test(
      corpus
    );
  const verificationHeavyTask =
    /(test|qa|regression|certification|validation|smoke|verify|reliability|checklist)/i.test(corpus);
  const minTotalFiles = smokeTask
    ? config.implementationQualityMinTotalFilesSmoke
    : config.implementationQualityMinTotalFiles;
  const minSourceFiles = smokeTask
    ? config.implementationQualityMinSourceFilesSmoke
    : config.implementationQualityMinSourceFiles;
  const requireVerificationForTask = smokeTask
    ? config.implementationQualityRequireVerificationForSmokeTasks
    : config.implementationQualityRequireVerificationForTestTasks;
  const artifactRoot = String(evidenceSnapshot?.artifactRootPath || "").trim();
  if (!artifactRoot) {
    return {
      pass: false,
      skipped: false,
      findings: ["Quality gate failed: task is missing canonical artifact folder path."],
      metrics: {
        artifactRoot: "",
        totalFiles: 0,
        sourceFiles: 0,
        hasReadme: false,
        verificationFiles: 0,
        codeTask,
        verificationHeavyTask,
        smokeTask,
        minTotalFiles,
        minSourceFiles,
        requireVerificationForTask,
      },
    };
  }

  const files = listVerifiableArtifactFiles(artifactRoot);
  const sourceExt = new Set([
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".css",
    ".scss",
    ".sql",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
    ".php",
    ".rb",
    ".c",
    ".cc",
    ".cpp",
    ".h",
    ".hpp",
    ".sh",
  ]);
  const sourceFiles = files.filter((f) => sourceExt.has(path.extname(f).toLowerCase()));
  const hasReadme = files.some((f) => /^readme(\.[a-z0-9_-]+)?$/i.test(path.basename(f)));
  const verificationFiles = files.filter((f) =>
    /(test|spec|qa|validation|verify|retest|regression|smoke|checklist|report)/i.test(
      path.basename(f)
    )
  );

  const findings = [];
  if (files.length < minTotalFiles) {
    findings.push(
      `Quality gate failed: deliverables too small (${files.length}/${minTotalFiles} files).`
    );
  }
  if (codeTask && sourceFiles.length < minSourceFiles) {
    findings.push(
      `Quality gate failed: insufficient source implementation files (${sourceFiles.length}/${minSourceFiles}).`
    );
  }
  if (codeTask && config.implementationQualityRequireReadme && !hasReadme) {
    findings.push("Quality gate failed: README is missing in artifact folder.");
  }
  if (
    verificationHeavyTask &&
    requireVerificationForTask &&
    verificationFiles.length === 0
  ) {
    findings.push(
      "Quality gate failed: verification evidence file is missing for test/validation-oriented task."
    );
  }
  if (codeTask && simpleTask && files.length < config.simpleTaskEnhancementMinTotalFiles) {
    findings.push(
      `Quality gate failed: simple/basic request must be enhanced beyond baseline (${files.length}/${config.simpleTaskEnhancementMinTotalFiles} files).`
    );
  }
  if (codeTask && simpleTask) {
    const enhancementSignals = files.filter((f) =>
      /(readme|test|spec|seed|style|ui|docs|guide|runbook|validation|checklist|report)/i.test(
        path.basename(f)
      )
    );
    if (enhancementSignals.length === 0) {
      findings.push(
        "Quality gate failed: simple/basic request lacks enhancement artifacts (README/tests/UX/docs)."
      );
    }
  }

  return {
    pass: findings.length === 0,
    skipped: false,
    findings,
    metrics: {
      artifactRoot,
      totalFiles: files.length,
      sourceFiles: sourceFiles.length,
      hasReadme,
      verificationFiles: verificationFiles.length,
      codeTask,
      verificationHeavyTask,
      smokeTask,
      simpleTask,
      minTotalFiles,
      minSourceFiles,
      requireVerificationForTask,
    },
  };
}

async function enforceDoneDeliverableIntegrity(task, agents) {
  if (String(task?.status || "") !== "done") return false;
  if (!taskRequiresOutputPathEvidence(task)) return false;

  const evidence = await inspectTaskEvidence(task._id);
  if ((evidence.outputPaths || []).length > 0) return false;

  const chief = agents.byName.get(config.chiefAgentName);
  const reason =
    "Done-state integrity check failed: required canonical Artifact Folder evidence is missing on disk.";

  await m((api).automation.reopenTaskAfterReview, {
    taskId: task._id,
    chiefAgentId: chief?._id,
    chiefAgentName: chief?.name || config.chiefAgentName,
    reason,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "executing",
    reviewStatus: "changes_requested",
    nextAction:
      "Reopened by integrity guard: required canonical Artifact Folder evidence is missing on disk. Assignee must regenerate deliverables there.",
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + 2 * 60 * 1000,
    nextAction:
      "Reopened by integrity guard: waiting for assignee to provide valid deliverable path evidence",
    chiefAgentId: chief?._id,
  });
  const steps = await listAccountabilitySteps(task._id);
  const specialistSteps = [...(steps || [])]
    .filter((step) => step.role === "specialist")
    .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
  const reworkStep = specialistSteps[specialistSteps.length - 1] || steps[0];
  let reworkResumed = false;
  if (reworkStep?.agentId) {
    const startResult = await ensureRunningStepStart(
      task._id,
      Number(reworkStep.stepIndex),
      reworkStep.agentId
    );
    reworkResumed = Boolean(startResult?.ok);
  }
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: chief?._id,
    fromName: chief?.name || config.chiefAgentName,
    kind: "system",
    workflowKind: resolveTaskWorkflowKind(task),
    content:
      `Chief integrity guard reopened task from done.\n` +
      `Reason: ${reason}\n` +
      `Required recovery: populate the canonical auto-managed Artifact Folder with verifiable deliverable files.` +
      (reworkResumed && reworkStep
        ? `\nRework resumed: ${reworkStep.agentName} step ${reworkStep.stepIndex} set to running.`
        : ""),
  });
  return true;
}

async function getAgentMap() {
  const agents = await q(api.agents.list, { includeRetired: true });
  const routable = agents.filter((agent) => agent.retired !== true && agent.routable !== false);
  return {
    all: agents,
    list: routable,
    byName: new Map(routable.map((a) => [a.name, a])),
    byId: new Map(agents.map((a) => [String(a._id), a])),
    byNameAll: new Map(agents.map((a) => [a.name, a])),
  };
}

async function backfillAccountabilityForTask(task, agents) {
  if (!config.accountabilityLedgerEnabled) return;
  if (isChiefPmParallelTask(task)) return;
  if (!["assigned", "in_progress", "review", "blocked", "waiting"].includes(String(task?.status || ""))) {
    return;
  }
  const existingSteps = await listAccountabilitySteps(task._id);
  const existingSpecialists = [...(existingSteps || [])]
    .filter((step) => step.role === "specialist")
    .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))
    .map((step) => agents.byId.get(String(step.agentId || "")))
    .filter(Boolean);
  const taskSpecialists = (task.assigneeIds ?? [])
    .map((id) => agents.byId.get(String(id)))
    .filter(Boolean);
  const fallbackSpecialists =
    existingSpecialists.length > 0
      ? existingSpecialists
      : taskSpecialists.length > 0
        ? taskSpecialists
        : chooseSpecialists(task, agents.list);

  const existingReviewerStep = [...(existingSteps || [])]
    .find((step) => step.role === "reviewer");
  const reviewer = task.reviewerAgentId
    ? agents.byId.get(String(task.reviewerAgentId))
    : existingReviewerStep
      ? agents.byId.get(String(existingReviewerStep.agentId || ""))
      : agents.byName.get(config.reviewerAgentName);

  if (existingSteps.length === 0) {
    await ensureAccountabilityWorkflow(task, fallbackSpecialists, reviewer);
    return;
  }

  const desired = buildWorkflowSteps(task, fallbackSpecialists, reviewer);
  const existingByIndex = new Map(
    (existingSteps || []).map((step) => [Number(step.stepIndex ?? 0), step])
  );
  const driftDetected = desired.some((step) => {
    const current = existingByIndex.get(Number(step.stepIndex ?? 0));
    if (!current) return true;
    const currentProof = String(current.requiredProof || "comment_summary");
    const desiredProof = String(step.requiredProof || "comment_summary");
    return (
      String(current.agentId || "") !== String(step.agentId || "") ||
      String(current.role || "") !== String(step.role || "") ||
      currentProof !== desiredProof
    );
  });
  if (!driftDetected) return;

  await ensureAccountabilityWorkflow(task, fallbackSpecialists, reviewer);
  await m((api).messages.create, {
    taskId: task._id,
    fromName: config.chiefAgentName,
    kind: "system",
    workflowKind: resolveTaskWorkflowKind(task),
    content:
      "Chief reconciliation: accountability workflow metadata was realigned (agent/proof gate drift corrected).",
  });
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
      "Mission Control bot commands:\n/task <description>\n/review <pr|diff|path>\n/debug <issue>\n/incident <description>\n/architecture <decision>\n/standup <context>\n/deploy-checklist <service/release>\n/status <task-id>\n/reopen <task-id> <reason>\n/enablechat <chat-id>\n(Plain text creates tasks only in the intake chat.)",
      message.message_id
    );
    return;
  }
  if (intent.command === "enablechat") {
    const match = String(message.text || "").match(/^\/enablechat\s+(-?\d+)/i);
    if (!match) {
      await sendTelegramText(message.chat.id, "Usage: /enablechat <chat-id>", message.message_id);
      return;
    }
    const changed = enableChat(match[1]);
    await sendTelegramText(
      message.chat.id,
      changed
        ? `Telegram chat ${match[1]} re-enabled for Mission Control notifications.`
        : `Telegram chat ${match[1]} was not disabled.`,
      message.message_id,
      { allowQueue: false }
    );
    return;
  }
  if (intent.command === "task_empty") {
    await sendTelegramText(message.chat.id, "Usage: /task <description>", message.message_id);
    return;
  }
  if (intent.command === "workflow_empty") {
    const cmd = String(intent.workflowCommand || "").toLowerCase();
    const usageMap = {
      "/review": "Usage: /review <PR URL, diff, or file path>",
      "/debug": "Usage: /debug <error message or issue description>",
      "/incident": "Usage: /incident <incident description>",
      "/architecture": "Usage: /architecture <decision or system>",
      "/standup": "Usage: /standup <yesterday/today/blockers context>",
      "/deploy-checklist": "Usage: /deploy-checklist <service or release name>",
    };
    await sendTelegramText(
      message.chat.id,
      usageMap[cmd] || "Usage: /task <description>",
      message.message_id
    );
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
    workflowCommand: intent.workflowCommand,
    workflowKind: resolveTaskWorkflowKind(
      {
        title: intent.text || "",
        description: intent.text || "",
        intakeText: intent.text || "",
        workflowCommand: intent.workflowCommand,
      },
      intent.workflowCommand
    ),
  });

  if (ingest?.deduped) return;
  if (ingest?.taskId) {
    try {
      const createdTask = await q(api.tasks.get, { id: ingest.taskId });
      if (createdTask) await ensureTaskArtifactRootReady(createdTask);
    } catch (error) {
      console.warn("[telegram] failed to prepare artifact root for new task", error);
    }
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
  let conflictSuppressedUntil = 0;
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
      const now = Date.now();
      if (isTelegramConflictError(error)) {
        if (now >= conflictSuppressedUntil) {
          console.warn(
            "[poller] getUpdates conflict (409): another bot poller is active for this token; backing off for 60s."
          );
          conflictSuppressedUntil = now + 60 * 1000;
        }
        markLoopHeartbeat("poller", { status: "conflict", offset });
        await sleep(60 * 1000);
        continue;
      }
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

async function replayOutboxOnce() {
  if (!config.outboxReplayEnabled) return;
  const outbox = loadOutbox();
  const now = Date.now();
  let changed = false;
  const due = (outbox.items || [])
    .filter((item) => Number(item.nextAttemptAt ?? 0) <= now)
    .slice(0, 20);

  for (const item of due) {
    if (!item?.chatId || !item?.text) {
      removeOutboxItem(outbox, item.id);
      changed = true;
      continue;
    }
    if (isChatDisabled(item.chatId)) {
      removeOutboxItem(outbox, item.id);
      changed = true;
      continue;
    }
    try {
      await telegramApi("sendMessage", {
        chat_id: item.chatId,
        text: item.text,
        reply_to_message_id: item.replyToMessageId ?? undefined,
        disable_web_page_preview: true,
      });
      if (item.taskId) {
        try {
          await m((api).telegram.setTaskTelegramDeliveryState, {
            taskId: item.taskId,
            state: "ok",
          });
        } catch (stateError) {
          console.error("[outbox] failed to mark delivery state ok", stateError);
        }
      }
      removeOutboxItem(outbox, item.id);
      changed = true;
    } catch (error) {
      const kind = classifyTelegramFailure(error);
      if (isPermanentTelegramFailure(kind)) {
        disableChat(item.chatId, kind, item.taskId);
        if (item.taskId) {
          try {
            await m((api).telegram.setTaskTelegramDeliveryState, {
              taskId: item.taskId,
              state: "disabled_chat",
              reason: kind,
            });
          } catch (stateError) {
            console.error("[outbox] failed to mark disabled delivery state", stateError);
          }
        }
        removeOutboxItem(outbox, item.id);
        changed = true;
        continue;
      }
      if (item.taskId) {
        try {
          await m((api).telegram.setTaskTelegramDeliveryState, {
            taskId: item.taskId,
            state: "transient_failure",
            reason: kind,
          });
        } catch (stateError) {
          console.error("[outbox] failed to mark transient delivery state", stateError);
        }
      }
      const nextAttempt = Number(item.attempt ?? 0) + 1;
      const backoffMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(nextAttempt, 8));
      item.attempt = nextAttempt;
      item.lastError = String(error?.message || error).slice(0, 1000);
      item.nextAttemptAt = Date.now() + backoffMs;
      changed = true;
      markDegraded(`outbox_replay_failed:${kind}`);
    }
  }

  if (changed) {
    persistOutbox(outbox);
  }
  patchRuntimeState({
    lastReplayAt: Date.now(),
    outboxSize: (outbox.items || []).length,
  });
  if ((outbox.items || []).length === 0) {
    clearDegradedIfHealthy();
  }
}

async function outboxReplayLoop(signal) {
  if (!config.outboxReplayEnabled) return;
  markLoopHeartbeat("outboxReplay", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("outboxReplay", { status: "loop" });
      await replayOutboxOnce();
    } catch (error) {
      console.error("[outbox] replay error", error);
      recordRuntimeError("outboxReplay", error);
      markLoopHeartbeat("outboxReplay", { status: "error" });
    }
    await sleep(config.outboxReplayIntervalMs);
  }
  markLoopHeartbeat("outboxReplay", { status: "stopped" });
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
      await ensureTaskArtifactRootReady(claimed);

      const workflowKind = resolveTaskWorkflowKind(claimed);
      const pmMode = isChiefPmParallelTask(claimed);
      const specialists = chooseSpecialists({ ...claimed, workflowKind }, agents.list);
      const primarySpecialist = specialists[0];
      const candidateProjectManager = pmMode
        ? findAgentByNames(
            agents,
            config.strictPmAgentRequired || config.strictRoleRouting
              ? ["Project Manager"]
              : ["Project Manager", "Peter", "Jarvis", config.chiefAgentName]
          )
        : null;
      const acceptanceCriteria = inferAcceptanceCriteria(claimed);
      const nextAction = pmMode
        ? `Assigned to ${candidateProjectManager?.name || "Project Manager"} for dependency-graph orchestration`
        : specialists.length
          ? specialists.length === 1
            ? `Assigned to ${specialists[0].name} for execution and updates`
            : `Sequential delegation planned (one agent at a time): ${formatDelegationQueue(specialists)}`
          : "Chief triage follow-up required";

      const summaryComment =
        `### Chief Triage (${chief.name})\n` +
        `- Workflow: ${workflowKind}\n` +
        `- Priority: ${claimed.priority}\n` +
        `- Assumptions: Best-effort classification from Telegram intake / task context\n` +
        `- Expected output: Concrete findings + status updates + evidence in comments/docs\n` +
        `- Next action: ${nextAction}\n` +
        `- Review gate: Reviewer validates correctness before done\n`;

      const labels = [...new Set([...(claimed.labels ?? []), "auto-managed", workflowLabel(workflowKind)])];
      await m(api.tasks.updateWorkflowMeta, {
        id: claimed._id,
        workflowKind,
        workflowCommand: claimed.workflowCommand,
        workflowVersion: 1,
        labels,
        nextAction,
      });
      await m((api).automation.setChiefTriageResult, {
        taskId: claimed._id,
        chiefAgentId: chief._id,
        chiefAgentName: chief.name,
        assigneeIds: pmMode
          ? candidateProjectManager
            ? [candidateProjectManager._id]
            : []
          : primarySpecialist
            ? [primarySpecialist._id]
            : [],
        priority: claimed.priority,
        labels,
        acceptanceCriteria,
        nextAction,
        staleAfterMinutes: claimed.staleAfterMinutes ?? config.taskStaleDefaultMinutes,
        summaryComment,
      });
      await emitExecutionEvent({
        taskId: claimed._id,
        actorAgentId: chief._id,
        actorName: chief.name,
        actorRole: "chief",
        kind: "triage",
        severity: "success",
        title: `Chief triage completed`,
        summary: `Workflow ${workflowKind}; ${nextAction}`,
        workDone: "Priority/labels/acceptance criteria set and assignee workflow initialized.",
        workingNow:
          specialists.length > 0
            ? `Preparing dispatch to ${specialists[0].name}.`
            : "No specialist selected yet.",
        nextSteps: nextAction,
        blockers: "",
        detailsMarkdown: summaryComment,
        detailsJson: {
          workflowKind,
          specialistQueue: specialists.map((a) => a.name),
          reviewer: config.reviewerAgentName,
        },
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

      let pmActivated = false;
      if (pmMode) {
        try {
          await ensureChiefPmGraph(claimed, agents, chief);
          await m((api).automation.setTaskNextCheck, {
            taskId: claimed._id,
            nextCheckAt: Date.now() + Math.max(config.chiefMonitorIntervalMs, 30 * 1000),
            nextAction:
              "Project Manager is orchestrating runnable dependency nodes; chief monitoring active.",
            chiefAgentId: chief._id,
          });
          pmActivated = true;
        } catch (error) {
          const message = String(error?.message || error || "unknown error");
          if (isExecutionGraphApiUnavailableError(error) || /execution_graph_unavailable/i.test(message)) {
            if (config.strictRoleRouting || config.strictPmAgentRequired) {
              await m(api.tasks.updateStatus, {
                id: claimed._id,
                status: "blocked",
                agentId: chief._id,
                agentName: chief.name,
              });
              await m((api).automation.updateTaskAutomationState, {
                taskId: claimed._id,
                automationState: "errored",
                reviewStatus: "pending",
                nextAction:
                  "Blocked: executionGraph APIs unavailable under STRICT_ROLE_ROUTING (no legacy downgrade allowed).",
              });
              await m((api).messages.create, {
                taskId: claimed._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                kind: "note",
                workflowKind,
                content:
                  "Chief blocked task: executionGraph APIs are unavailable and strict role routing is enabled. " +
                  "PM workflow cannot downgrade to legacy routing.",
              });
              await emitExecutionEvent({
                taskId: claimed._id,
                actorAgentId: chief._id,
                actorName: chief.name,
                actorRole: "chief",
                kind: "recovery",
                severity: "error",
                title: "PM workflow blocked (strict routing)",
                summary: "executionGraph unavailable and legacy fallback disabled",
                workDone: "Chief enforced strict-role policy and blocked unsafe downgrade.",
                workingNow: "Waiting for executionGraph availability.",
                nextSteps: "Deploy executionGraph functions, then reopen task.",
                blockers: message,
              });
            } else {
              await m(api.tasks.updateWorkflowMeta, {
                id: claimed._id,
                workflowKind,
                workflowCommand: claimed.workflowCommand,
                workflowVersion: 1,
                labels,
                nextAction:
                  "PM graph APIs unavailable on current deployment. Falling back to legacy sequential execution.",
                orchestrationModel: "legacy_sequential",
              });
              await m((api).messages.create, {
                taskId: claimed._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                kind: "note",
                workflowKind,
                content:
                  "Chief fallback: executionGraph APIs are unavailable on this deployment, so this task is downgraded to legacy sequential mode to avoid stalling.",
              });
              await emitExecutionEvent({
                taskId: claimed._id,
                actorAgentId: chief._id,
                actorName: chief.name,
                actorRole: "chief",
                kind: "recovery",
                severity: "warning",
                title: "PM workflow downgraded to legacy",
                summary: "executionGraph functions unavailable; using sequential fallback",
                workDone: "Chief downgraded orchestration model for reliability.",
                workingNow: "Legacy specialist dispatch path continues.",
                nextSteps: "Deploy executionGraph functions to re-enable PM graph mode.",
                blockers: message,
              });
            }
          } else {
            throw error;
          }
        }
      }
      if (pmActivated) {
        continue;
      }

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
          await blockAccountabilityStep(
            claimed._id,
            stepIndex,
            `agent_unavailable: ${specialist.name} is busy on another active task`,
            "blocked"
          );
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
            kind: "handoff",
            stepIndex,
            workflowKind,
            content: `Chief handoff: assigning ${specialist.name} next. Policy: one active assignee at a time.`,
          });
        }

        const preDispatchTask = await q(api.tasks.get, { id: claimed._id });
        const preDispatchMessages = await q(api.messages.listByTask, { taskId: claimed._id });
        const preDispatchCommentCount = Number(preDispatchTask?.commentCount ?? 0);
        const preDispatchAttachmentCount = Number(preDispatchTask?.attachmentCount ?? 0);
        const preDispatchMessageCount = Number(preDispatchMessages?.length ?? 0);

        const requiredOutputPath = await ensureAgentWritableOutputPathReady(claimed);
        const prompt = buildSpecialistPrompt({
          task: claimed,
          specialist,
          workflowKind,
          stepIndex,
          totalSteps: specialists.length,
          nextSpecialist,
          deliverablesRoot: config.taskArtifactsRoot,
          requiredOutputPath,
        });
        const specialistDispatchStartedAt = Date.now();
        const specialistRunId = await startAutomationRun({
          taskId: claimed._id,
          role: "specialist",
          agentName: specialist.name,
          agentId: specialist._id,
          dispatchType: "execution",
          attempt: 1,
          inputSummary: `Dispatch to ${specialist.name}`,
        });
        await attachDispatchRunToStep(claimed._id, stepIndex, specialistRunId);

        const result = await runOpenClawAgent({
          role: "specialist",
          task: claimed,
          prompt,
          targetAgent: specialist,
        });
        const specialistRunFinalId = await finishAutomationRun({
          taskId: claimed._id,
          role: "specialist",
          agentName: specialist.name,
          agentId: specialist._id,
          dispatchType: "execution",
          attempt: 1,
          inputSummary: `Dispatch to ${specialist.name}`,
          startedAt: specialistDispatchStartedAt,
          result,
          successSummary: "OpenClaw dispatch invoked",
          failureSummary: "Dispatch failed",
        });
        await attachDispatchRunToStep(claimed._id, stepIndex, specialistRunFinalId);

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
              stepIndex,
              totalSteps: specialists.length,
              workflowKind,
              nextHandoff: nextSpecialist ? nextSpecialist.name : "Reviewer",
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

          let specialistProofMessage = [...(postDispatchMessages ?? [])]
            .slice(preDispatchMessageCount)
            .reverse()
            .find(
              (msg) =>
                String(msg?.fromName || "").toLowerCase() ===
                String(specialist.name || "").toLowerCase()
            );
          let evidenceAfterRun = await inspectTaskEvidence(claimed._id);
          const summaryAfterRun = summarizeOpenClawRunOutput(result);
          const pathRequiredTask = taskRequiresOutputPathEvidence(claimed);
          let runsForQualityAutofix = await q((api).automation.listAutomationRunsByTask, {
            taskId: claimed._id,
          });
          let worklogValid = specialistProofMessage
            ? isStructuredWorklog(String(specialistProofMessage.content || ""), {
                requirePath: false,
              })
            : false;

          if (config.structuredWorklogRequired && !worklogValid) {
            // Self-heal schema issues by synthesizing a structured worklog from run output.
            await relaySpecialistRunUpdate({
              taskId: claimed._id,
              task: claimed,
              specialist,
              result,
              stepIndex,
              totalSteps: specialists.length,
              workflowKind,
              nextHandoff: nextSpecialist ? nextSpecialist.name : "Reviewer",
            });
            postDispatchMessages = await q(api.messages.listByTask, { taskId: claimed._id });
            postDispatchTask = await q(api.tasks.get, { id: claimed._id });
            specialistProofMessage = [...(postDispatchMessages ?? [])]
              .slice(preDispatchMessageCount)
              .reverse()
              .find(
                (msg) =>
                  String(msg?.fromName || "").toLowerCase() ===
                  String(specialist.name || "").toLowerCase()
              );
            worklogValid = specialistProofMessage
              ? isStructuredWorklog(String(specialistProofMessage.content || ""), {
                  requirePath: false,
                })
              : false;
            evidenceAfterRun = await inspectTaskEvidence(claimed._id);
            evidenceProgress =
              evidenceProgress ||
              Number(postDispatchTask?.commentCount ?? 0) > preDispatchCommentCount ||
              Number(postDispatchTask?.attachmentCount ?? 0) > preDispatchAttachmentCount;
          }

          if (config.structuredWorklogRequired && !worklogValid) {
            const qualityAutofix = await attemptSpecialistQualityAutofix({
              task: claimed,
              specialist,
              workflowKind,
              issues: [
                "invalid_worklog_schema: required structured worklog fields missing after initial dispatch",
              ],
              requiredOutputPath: requiredOutputPath || (await ensureAgentWritableOutputPathReady(claimed)),
              stepIndex,
              totalSteps: specialists.length,
              nextHandoff: nextSpecialist ? nextSpecialist.name : "Reviewer",
              runs: runsForQualityAutofix,
              dispatchContext: "structured_worklog",
            });
            if (qualityAutofix.success) {
              runsForQualityAutofix = await q((api).automation.listAutomationRunsByTask, {
                taskId: claimed._id,
              });
              postDispatchTask = await q(api.tasks.get, { id: claimed._id });
              postDispatchMessages = qualityAutofix.postMessages || (await q(api.messages.listByTask, { taskId: claimed._id }));
              specialistProofMessage = [...(postDispatchMessages ?? [])]
                .slice(preDispatchMessageCount)
                .reverse()
                .find(
                  (msg) =>
                    String(msg?.fromName || "").toLowerCase() ===
                    String(specialist.name || "").toLowerCase()
                );
              worklogValid = specialistProofMessage
                ? isStructuredWorklog(String(specialistProofMessage.content || ""), {
                    requirePath: false,
                  })
                : false;
              evidenceAfterRun = await inspectTaskEvidence(claimed._id);
              evidenceProgress =
                evidenceProgress ||
                Number(postDispatchTask?.commentCount ?? 0) > preDispatchCommentCount ||
                Number(postDispatchTask?.attachmentCount ?? 0) > preDispatchAttachmentCount;
            }
          }

          if (config.structuredWorklogRequired && !worklogValid && isStrictAccountabilityGateEnabled()) {
            const schemaPathIssue =
              pathRequiredTask && (evidenceAfterRun.outputPaths?.length ?? 0) === 0
                ? deriveOutputPathEvidenceFailure(
                    evidenceAfterRun,
                    "specialist worklog is missing verifiable artifact evidence"
                  )
                : null;
            const schemaReason =
              schemaPathIssue?.reason ||
              "invalid_worklog_schema: specialist update did not follow required worklog format";
            await blockTaskWithStep({
              task: claimed,
              chief,
              stepIndex,
              reason: schemaReason,
              nextAction: pathRequiredTask
                ? `Blocked: ${specialist.name} must post structured worklog plus verifiable Artifact Folder evidence`
                : `Blocked: ${specialist.name} must post structured worklog before handoff`,
              comment:
                `Chief block: ${specialist.name} did not provide a valid structured worklog.\n` +
                `Required fields: Objective, Actions Taken, Findings, Evidence, Blockers, Next Handoff` +
                `${pathRequiredTask ? ", with verifiable Artifact Folder evidence." : "."}`,
            });
            break;
          }

          if (!evidenceProgress && !taskLeftExecution) {
            const pathIssue =
              pathRequiredTask && (evidenceAfterRun.outputPaths?.length ?? 0) === 0
                ? deriveOutputPathEvidenceFailure(
                    evidenceAfterRun,
                    "specialist evidence is missing verifiable Artifact Folder output"
                  )
                : null;
            if (
              (!pathRequiredTask || Boolean(pathIssue)) &&
              config.specialistQualityAutofixEnabled
            ) {
              const qualityAutofix = await attemptSpecialistQualityAutofix({
                task: claimed,
                specialist,
                workflowKind,
                issues: [
                  pathIssue?.reason ||
                    "no_assignee_progress: no specialist evidence was posted after dispatch",
                ],
                requiredOutputPath: requiredOutputPath || (await ensureAgentWritableOutputPathReady(claimed)),
                stepIndex,
                totalSteps: specialists.length,
                nextHandoff: nextSpecialist ? nextSpecialist.name : "Reviewer",
                runs: runsForQualityAutofix,
                dispatchContext: "evidence_missing",
              });
              if (qualityAutofix.success) {
                postDispatchTask = await q(api.tasks.get, { id: claimed._id });
                postDispatchMessages = qualityAutofix.postMessages || (await q(api.messages.listByTask, { taskId: claimed._id }));
                evidenceAfterRun = await inspectTaskEvidence(claimed._id);
                evidenceProgress =
                  Number(postDispatchTask?.commentCount ?? 0) > preDispatchCommentCount ||
                  Number(postDispatchTask?.attachmentCount ?? 0) > preDispatchAttachmentCount ||
                  (evidenceAfterRun.outputPaths?.length ?? 0) > 0;
                taskLeftExecution =
                  postDispatchTask?.status === "review" || postDispatchTask?.status === "done";
                specialistProofMessage = [...(postDispatchMessages ?? [])]
                  .slice(preDispatchMessageCount)
                  .reverse()
                  .find(
                    (msg) =>
                      String(msg?.fromName || "").toLowerCase() ===
                      String(specialist.name || "").toLowerCase()
                  );
              }
            }
          }

          if (!evidenceProgress && !taskLeftExecution) {
            if (isStrictAccountabilityGateEnabled()) {
              await blockTaskWithStep({
                task: claimed,
                chief,
                stepIndex,
                reason: "no_assignee_progress: no assignee evidence was posted after specialist dispatch",
                nextAction: nextSpecialist
                  ? `Blocked: waiting on ${specialist.name} evidence before handoff to ${nextSpecialist.name}`
                  : `Blocked: awaiting final evidence/update from ${specialist.name} before review`,
                comment: nextSpecialist
                  ? `Chief block: dispatch reached ${specialist.name}, but no new task evidence was posted. ` +
                    `Handoff to ${nextSpecialist.name} is blocked until ${specialist.name} posts concrete progress evidence.`
                  : `Chief block: dispatch reached ${specialist.name}, but no final artifact evidence is posted yet. ` +
                    `Populate the auto-managed Artifact Folder and post structured evidence to unblock review handoff.`,
              });
              break;
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
                ? `Chief monitor: dispatch reached ${specialist.name}, but no new task evidence was posted yet. Handoff to ${nextSpecialist.name} is paused until ${specialist.name} posts concrete artifact evidence.`
                : `Chief monitor: dispatch reached ${specialist.name}, but no final artifact evidence is posted yet. Review handoff is paused until canonical Artifact Folder evidence appears.`,
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
              kind: "handoff",
              stepIndex,
              workflowKind,
              content: `Chief monitor: ${specialist.name} completed a work turn. Preparing immediate handoff to ${nextSpecialist.name}.`,
            });
          } else {
            const evidence = await inspectTaskEvidence(claimed._id);
            const hasOutputPathEvidence = evidence.outputPaths.length > 0;
            const hasReadyEvidence =
              (config.structuredWorklogRequired
                ? evidence.hasStructuredAssigneeEvidence
                : evidence.hasAssigneeEvidence) &&
              (!pathRequiredTask || hasOutputPathEvidence);

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
                  `Chief monitor: Final specialist turn completed with evidence${pathRequiredTask ? " (including output path)" : ""}. ` +
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
                nextAction: pathRequiredTask
                  ? `Awaiting final evidence from ${specialist.name} (auto-managed Artifact Folder), then review`
                  : `Awaiting final evidence/update from ${specialist.name}, then review`,
                chiefAgentId: chief._id,
              });
              await m((api).messages.create, {
                taskId: claimed._id,
                fromAgentId: chief._id,
                fromName: chief.name,
                content: pathRequiredTask
                  ? `Chief monitor: ${specialist.name} finished a turn but final coding evidence is incomplete. Please post a concrete summary and ensure deliverables exist in the auto-managed Artifact Folder so review can start immediately.`
                  : `Chief monitor: ${specialist.name} finished a turn but final evidence/update is still needed before review.`,
              });
              if (isStrictAccountabilityGateEnabled()) {
                const pathIssue =
                  deriveOutputPathEvidenceFailure(
                    evidence,
                    "final specialist artifact evidence not present in canonical folder"
                  ) || {
                    code: "artifact_folder_empty",
                    reason: "artifact_folder_empty: final specialist artifact evidence not present in canonical folder",
                  };
                await blockTaskWithStep({
                  task: claimed,
                  chief,
                  stepIndex,
                  reason: pathRequiredTask
                    ? pathIssue.reason
                    : "no_assignee_progress: final specialist evidence incomplete",
                  nextAction: pathRequiredTask
                    ? pathIssue.code === "artifact_path_not_found"
                      ? "Blocked: canonical artifact folder path is missing; assignee must regenerate outputs there"
                      : pathIssue.code === "artifact_folder_empty"
                        ? "Blocked: canonical artifact folder has no deliverable files; assignee must write artifacts there"
                        : isInvalidOutputPathIssue(pathIssue.code)
                      ? "Blocked: assignee must correct invalid path references and ensure canonical artifact folder has deliverables before review"
                      : "Blocked: assignee must provide verifiable Artifact Folder evidence before review"
                    : "Blocked: assignee must post concrete evidence before review",
                  comment: pathRequiredTask
                    ? pathIssue.code === "artifact_path_not_found"
                      ? `Chief block: canonical artifact folder for this task is missing on disk. ` +
                        `Recreate deliverables in the auto-managed folder and post structured evidence to unblock review.`
                      : pathIssue.code === "artifact_folder_empty"
                        ? `Chief block: canonical artifact folder exists but contains no verifiable deliverable files. ` +
                          `Populate that folder with real artifacts and post structured evidence to unblock review.`
                      : isInvalidOutputPathIssue(pathIssue.code)
                      ? `Chief block: ${specialist.name} reported an Output Path/Stored Location, but the path is missing on disk. ` +
                        `Create/fix deliverables in the canonical Artifact Folder (or post a corrected existing path) to unblock review.`
                      : `Chief block: ${specialist.name} finished a turn but final coding evidence is incomplete. ` +
                        `Post concrete summary and ensure the canonical Artifact Folder contains verifiable deliverables to unblock review.`
                    : `Chief block: ${specialist.name} finished a turn but final evidence/update is still missing.`,
                });
              }
            }
          }
        } else {
          const dispatchError = String(result.stderr || result.stdout || "Unknown dispatch error").slice(0, 500);
          await blockTaskWithStep({
            task: claimed,
            chief,
            stepIndex,
            reason: `dispatch_failed: ${dispatchError}`,
            stepStatus: "failed",
            nextAction: `Blocked: dispatch failed for ${specialist.name}; check runtime and retry`,
            comment:
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

async function attemptBlockedTaskAutoRecovery(task, chief, agents) {
  if (!config.autoRecoverBlockedTasksEnabled || !config.accountabilityLedgerEnabled) {
    return false;
  }

  const steps = await listAccountabilitySteps(task._id);
  const blockedStep = [...(steps || [])]
    .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))
    .find((step) => String(step?.status) === "blocked" || String(step?.status) === "failed");
  if (!blockedStep) return false;

  const blockedReason = String(blockedStep.stuckReason || task.nextAction || "blocked").trim();
  const blockedCode = reasonCode(blockedReason);
  if (!AUTO_RECOVERABLE_BLOCK_REASONS.has(blockedCode)) return false;

  let assignee =
    agents.byId.get(String(blockedStep.agentId || "")) ||
    (task.assigneeIds ?? []).map((id) => agents.byId.get(String(id))).find(Boolean);
  if (!assignee?._id) return false;
  const stepIndex = Number(blockedStep.stepIndex ?? 0);
  const workflowKind = resolveTaskWorkflowKind(task);

  const now = Date.now();
  const recoveryState = blockedRecoveryState(task._id);
  const sameReason = String(recoveryState.lastReasonCode || "") === blockedCode;
  const lastAttemptAt = Number(recoveryState.lastAttemptAt ?? 0);
  if (sameReason && lastAttemptAt > 0 && now - lastAttemptAt < config.blockedRecoveryCooldownMs) {
    const retryInMs = Math.max(60 * 1000, config.blockedRecoveryCooldownMs - (now - lastAttemptAt));
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: now + retryInMs,
      nextAction:
        blockedCode === "agent_unavailable"
          ? `Auto-recovery waiting: retrying ${assignee.name} availability in ${Math.ceil(retryInMs / 60000)}m`
          : `Blocked auto-recovery cooldown: retrying ${assignee.name} for ${blockedCode} in ${Math.ceil(
              retryInMs / 60000
            )}m`,
      chiefAgentId: chief._id,
    });
    return true;
  }

  let attempt = sameReason ? Number(recoveryState.attempts ?? 0) + 1 : 1;
  updateBlockedRecoveryState(task._id, {
    attempts: attempt,
    lastAttemptAt: now,
    lastReasonCode: blockedCode,
    lastOutcome: "recovery_started",
  });

  if (sameReason && attempt > config.blockedRecoveryMaxAttempts) {
    if (NON_TERMINAL_RECOVERY_CODES.has(blockedCode)) {
      if (RECOVERY_REASSIGNABLE_CODES.has(blockedCode)) {
        const alternate = await findAvailableRecoverySpecialist(task, agents, assignee._id);
        if (alternate && String(alternate._id) !== String(assignee._id)) {
          await rewriteStepAssignee(task._id, steps, stepIndex, alternate);
          const switched = await ensureRunningStepStart(task._id, stepIndex, alternate._id);
          if (switched?.ok || switched?.alreadyRunning) {
            await m(api.tasks.assign, {
              id: task._id,
              assigneeIds: [alternate._id],
              agentName: chief.name,
            });
            await m(api.tasks.updateStatus, {
              id: task._id,
              status: "in_progress",
              agentId: chief._id,
              agentName: chief.name,
            });
            await m((api).automation.updateTaskAutomationState, {
              taskId: task._id,
              automationState: "executing",
              reviewStatus: task.reviewStatus ?? "changes_requested",
              nextAction:
                `Recovery reassigned after repeated ${blockedCode}: ` +
                `${assignee.name} -> ${alternate.name}`,
            });
            await m((api).automation.setTaskNextCheck, {
              taskId: task._id,
              nextCheckAt: now + 2 * 60 * 1000,
              nextAction: `Execution resumed by ${alternate.name} after recovery reassignment`,
              chiefAgentId: chief._id,
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              kind: "handoff",
              stepIndex,
              workflowKind,
              content:
                `Chief auto-recovery reassignment: repeated ${blockedCode} from ${assignee.name}. ` +
                `Step ${stepIndex} reassigned to ${alternate.name} for a fresh execution attempt.`,
            });
            updateBlockedRecoveryState(task._id, {
              attempts: 1,
              lastAttemptAt: now,
              lastReasonCode: blockedCode,
              lastOutcome: `recovery_reassigned:${assignee.name}->${alternate.name}`,
            });
            return true;
          }
        }
      }
      const continuationAlready = String(recoveryState.lastOutcome || "").startsWith(
        "recovery_continues:"
      );
      attempt = config.blockedRecoveryMaxAttempts;
      updateBlockedRecoveryState(task._id, {
        attempts: attempt,
        lastOutcome: `recovery_continues:${blockedCode}`,
      });
      if (!continuationAlready) {
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          kind: "system",
          stepIndex,
          workflowKind,
          content:
            `Chief auto-recovery: keeping autonomous retries active for recoverable reason ${blockedCode}. ` +
            `Task will continue retrying until real evidence is produced.`,
        });
      }
    } else {
    const exhaustedAlready = String(recoveryState.lastOutcome || "").startsWith("recovery_exhausted");
    if (!exhaustedAlready) {
      await blockTaskWithStep({
        task,
        chief,
        stepIndex,
        reason:
          `agent_unavailable: blocked auto-recovery exhausted (${config.blockedRecoveryMaxAttempts} attempts) ` +
          `for ${blockedCode}; waiting for new specialist evidence`,
        nextAction:
          `Blocked: auto-recovery paused after ${config.blockedRecoveryMaxAttempts} failed attempts ` +
          `(${blockedCode}); waiting for fresh assignee evidence`,
        comment:
          `Chief auto-recovery paused for ${assignee.name}: reached ${config.blockedRecoveryMaxAttempts} ` +
          `failed retries for ${blockedCode}. New specialist evidence is required before retrying.`,
        nextCheckInMinutes: Math.max(5, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
      });
    } else {
      await m((api).automation.setTaskNextCheck, {
        taskId: task._id,
        nextCheckAt: now + Math.max(config.blockedRecoveryCooldownMs, 5 * 60 * 1000),
        nextAction:
          `Blocked: auto-recovery paused after repeated failures (${blockedCode}); waiting for fresh evidence`,
        chiefAgentId: chief._id,
      });
    }
    updateBlockedRecoveryState(task._id, {
      lastOutcome: `recovery_exhausted:${blockedCode}`,
    });
    return true;
    }
  }

  if (await agentHasRunningWorkElsewhere(assignee, task._id)) {
    const alternate = await findAvailableRecoverySpecialist(task, agents, assignee._id);
    if (alternate && String(alternate._id) !== String(assignee._id)) {
      await rewriteStepAssignee(task._id, steps, stepIndex, alternate);
      const switched = await ensureRunningStepStart(task._id, stepIndex, alternate._id);
      if (switched?.ok || switched?.alreadyRunning) {
        await m(api.tasks.assign, {
          id: task._id,
          assigneeIds: [alternate._id],
          agentName: chief.name,
        });
        await m(api.tasks.updateStatus, {
          id: task._id,
          status: "in_progress",
          agentId: chief._id,
          agentName: chief.name,
        });
        await m((api).automation.updateTaskAutomationState, {
          taskId: task._id,
          automationState: "executing",
          reviewStatus: task.reviewStatus ?? "changes_requested",
          nextAction: `Recovery auto-reassigned (busy): ${assignee.name} -> ${alternate.name}`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: now + 2 * 60 * 1000,
          nextAction: `Execution resumed by ${alternate.name} after busy-agent reassignment`,
          chiefAgentId: chief._id,
        });
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          kind: "handoff",
          stepIndex,
          workflowKind,
          content:
            `Chief auto-recovery reassignment: ${assignee.name} is busy on another running task. ` +
            `Step ${stepIndex} moved to ${alternate.name} for immediate execution.`,
        });
        assignee = alternate;
      }
    }
  }

  if (await agentHasRunningWorkElsewhere(assignee, task._id)) {
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "assigned",
      reviewStatus: task.reviewStatus ?? "changes_requested",
      nextAction: `Auto-recovery waiting: ${assignee.name} is busy on another running task`,
    });
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: now + Math.min(config.blockedRecoveryCooldownMs, 2 * 60 * 1000),
      nextAction: `Auto-recovery waiting: ${assignee.name} is busy on another running task`,
      chiefAgentId: chief._id,
    });
    await m((api).messages.create, {
      taskId: task._id,
      fromAgentId: chief._id,
      fromName: chief.name,
      kind: "system",
      stepIndex,
      workflowKind,
      content:
        `Chief auto-recovery wait: ${assignee.name} is currently busy on another running task. ` +
        `Keeping existing proof state; retry scheduled automatically.`,
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "agent_busy_elsewhere",
    });
    return true;
  }

  const orderedSteps = [...(steps || [])].sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
  const nextStep = orderedSteps.find((step) => Number(step.stepIndex) === stepIndex + 1) || null;
  const nextStepAgent = nextStep ? agents.byId.get(String(nextStep.agentId || "")) : null;
  const nextHandoffName =
    nextStepAgent?.name ||
    (nextStep?.role === "reviewer" ? config.reviewerAgentName : "Reviewer");
  const pathRequiredTask = taskRequiresOutputPathEvidence(task);
  const existingEvidence = await inspectTaskEvidence(task._id);
  const existingPathIssue = pathRequiredTask
    ? deriveOutputPathEvidenceFailure(
        existingEvidence,
        "blocked recovery pre-check is missing final path evidence"
      )
    : null;
  const existingProofReady = config.structuredWorklogRequired
    ? existingEvidence.hasStructuredAssigneeEvidence
    : existingEvidence.hasAssigneeEvidence;

  if (existingProofReady && (!pathRequiredTask || !existingPathIssue)) {
    const proofMessage = latestAssigneeMessage(existingEvidence.taskMessages, assignee);
    const precheckSummary = summarizeOpenClawRunOutput({
      stdout: String(proofMessage?.content || ""),
      stderr: "",
    });
    await recordAccountabilityProof({
      taskId: task._id,
      stepIndex,
      summary:
        precheckSummary.lines.join(" | ") ||
        "Existing specialist evidence validated by blocked-recovery pre-check.",
      paths: existingEvidence.outputPaths ?? [],
      proofMessageId: proofMessage?._id,
      proofDocumentIds: [],
    });

    const refreshedSteps = await listAccountabilitySteps(task._id);
    const refreshedOrdered = [...(refreshedSteps || [])].sort(
      (a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0)
    );
    const refreshedNext =
      refreshedOrdered.find((step) => Number(step.stepIndex) === stepIndex + 1) || null;

    if (refreshedNext?.role === "reviewer") {
      const reviewer =
        agents.byId.get(String(refreshedNext.agentId || "")) ||
        agents.byName.get(config.reviewerAgentName);
      if (reviewer) {
        await handoffAccountabilityStep(
          task._id,
          stepIndex,
          Number(refreshedNext.stepIndex),
          chief.name,
          true
        );
        await m((api).automation.submitForReview, {
          taskId: task._id,
          reviewerAgentId: reviewer._id,
          requesterAgentId: chief._id,
          requesterAgentName: chief.name,
          note:
            `Chief auto-recovery pre-check validated existing evidence for '${task.title}' and ` +
            `submitted the task for review.`,
        });
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          kind: "handoff",
          stepIndex,
          workflowKind,
          content:
            `Chief auto-recovery pre-check: existing ${assignee.name} evidence is valid. ` +
            `Task submitted to ${reviewer.name} for review.`,
        });
        clearBlockedRecoveryState(task._id);
        return true;
      }
    }

    if (refreshedNext?.role === "specialist") {
      const nextSpecialist = agents.byId.get(String(refreshedNext.agentId || ""));
      if (nextSpecialist?._id) {
        const nextStarted = await ensureRunningStepStart(
          task._id,
          Number(refreshedNext.stepIndex),
          nextSpecialist._id
        );
        if (nextStarted?.ok || nextStarted?.alreadyRunning) {
          await handoffAccountabilityStep(
            task._id,
            stepIndex,
            Number(refreshedNext.stepIndex),
            chief.name,
            true
          );
          await m(api.tasks.assign, {
            id: task._id,
            assigneeIds: [nextSpecialist._id],
            agentName: chief.name,
          });
          await m(api.tasks.updateStatus, {
            id: task._id,
            status: "in_progress",
            agentId: chief._id,
            agentName: chief.name,
          });
          await m((api).automation.updateTaskAutomationState, {
            taskId: task._id,
            automationState: "executing",
            reviewStatus: task.reviewStatus ?? "pending",
            nextAction: `Execution resumed after pre-check: ${nextSpecialist.name} is now running`,
          });
          await m((api).automation.setTaskNextCheck, {
            taskId: task._id,
            nextCheckAt: Date.now() + 2 * 60 * 1000,
            nextAction: `Execution in progress by ${nextSpecialist.name} after evidence pre-check`,
            chiefAgentId: chief._id,
          });
          await m((api).messages.create, {
            taskId: task._id,
            fromAgentId: chief._id,
            fromName: chief.name,
            kind: "handoff",
            stepIndex: Number(refreshedNext.stepIndex),
            workflowKind,
            content:
              `Chief auto-recovery pre-check: existing ${assignee.name} evidence accepted. ` +
              `Handoff completed to ${nextSpecialist.name}.`,
          });
          clearBlockedRecoveryState(task._id);
          return true;
        }
      }
    }
  }

  const started = await ensureRunningStepStart(task._id, stepIndex, assignee._id);
  if (!started?.ok && !started?.alreadyRunning) {
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: now + Math.min(config.blockedRecoveryCooldownMs, 2 * 60 * 1000),
      nextAction: `Blocked auto-recovery waiting: could not start ${assignee.name} step (${String(
        started?.reason || "step_lock"
      )})`,
      chiefAgentId: chief._id,
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: `step_start_blocked:${String(started?.reason || "unknown")}`,
    });
    return true;
  }

  await m(api.tasks.assign, {
    id: task._id,
    assigneeIds: [assignee._id],
    agentName: chief.name,
  });
  await m(api.tasks.updateStatus, {
    id: task._id,
    status: "in_progress",
    agentId: chief._id,
    agentName: chief.name,
  });
  await m((api).automation.updateTaskAutomationState, {
    taskId: task._id,
    automationState: "executing",
    reviewStatus: task.reviewStatus ?? "pending",
    nextAction: `Blocked auto-recovery in progress by ${assignee.name} (reason: ${blockedCode}, attempt ${attempt})`,
  });
  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: now + 5 * 60 * 1000,
    nextAction: `Execution in progress by ${assignee.name} (blocked auto-recovery attempt ${attempt})`,
    chiefAgentId: chief._id,
  });
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: chief._id,
    fromName: chief.name,
    kind: "system",
    stepIndex,
    workflowKind,
    content:
      `Chief auto-recovery: restarting ${assignee.name} on blocked step ${stepIndex}.\n` +
      `Reason: ${blockedReason}\n` +
      `Attempt: ${attempt}`,
  });

  const [preDispatchMessages, preDispatchDocs] = await Promise.all([
    q(api.messages.listByTask, { taskId: task._id }),
    q(api.documents.list, { taskId: task._id }),
  ]);
  const preDispatchMessageCount = Number(preDispatchMessages?.length ?? 0);
  const preDispatchDocCount = Number(preDispatchDocs?.length ?? 0);
  const recoveryPrompt =
    `${buildSpecialistPrompt({
      task,
      specialist: assignee,
      workflowKind,
      stepIndex,
      totalSteps: Math.max(1, orderedSteps.filter((step) => step.role === "specialist").length),
      nextSpecialist: nextStep?.role === "specialist" ? nextStepAgent : null,
      deliverablesRoot: config.taskArtifactsRoot,
      requiredOutputPath: await ensureAgentWritableOutputPathReady(task),
    })}\n\n` +
    `Blocked recovery context:\n` +
    `- Previous block reason: ${blockedReason}\n` +
    `- You must autonomously diagnose root cause, apply fix, rerun checks, and post a structured worklog.\n` +
    `- Include concrete evidence.${pathRequiredTask ? " Use the canonical Artifact Folder for this task (manual Output Path text is optional)." : ""}\n` +
    (pathRequiredTask
      ? `- Artifact evidence is accepted only if verifiable files exist on disk now in the canonical Artifact Folder.`
      : "");

  const dispatchStartedAt = Date.now();
  const dispatchRunId = await startAutomationRun({
    taskId: task._id,
    role: "specialist",
    agentName: assignee.name,
    agentId: assignee._id,
    dispatchType: "monitor",
    attempt,
    inputSummary: `Blocked auto-recovery dispatch to ${assignee.name} (${blockedCode})`,
  });
  await attachDispatchRunToStep(task._id, stepIndex, dispatchRunId);

  const retryResult = await runOpenClawAgent({
    role: "specialist",
    task,
    prompt: recoveryPrompt,
    targetAgent: assignee,
  });
  const dispatchRunFinalId = await finishAutomationRun({
    taskId: task._id,
    role: "specialist",
    agentName: assignee.name,
    agentId: assignee._id,
    dispatchType: "monitor",
    attempt,
    inputSummary: `Blocked auto-recovery dispatch to ${assignee.name} (${blockedCode})`,
    startedAt: dispatchStartedAt,
    result: retryResult,
    successSummary: "Blocked auto-recovery dispatch succeeded",
    failureSummary: "Blocked auto-recovery dispatch failed",
  });
  await attachDispatchRunToStep(task._id, stepIndex, dispatchRunFinalId);

  if (retryResult.code !== 0) {
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: "dispatch_failed: blocked auto-recovery dispatch failed",
      stepStatus: "failed",
      nextAction: `Blocked: auto-recovery dispatch failed for ${assignee.name}; retry queued automatically`,
      comment:
        `Chief auto-recovery dispatch failed for ${assignee.name}. ` +
        `Error (truncated): ${String(retryResult.stderr || retryResult.stdout || "unknown").slice(0, 400)}`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "dispatch_failed",
    });
    return true;
  }

  await m((api).automation.recordAssigneeHeartbeat, {
    taskId: task._id,
    agentId: assignee._id,
    agentName: assignee.name,
    note: `Chief auto-recovery dispatched ${assignee.name} for blocked reason ${blockedCode}`,
  });
  await m(api.agents.updateStatus, {
    id: assignee._id,
    status: "active",
    currentTaskId: task._id,
  });

  let postDispatchMessages = await q(api.messages.listByTask, { taskId: task._id });
  let freshAssigneeMessage = latestAssigneeMessage(
    postDispatchMessages.slice(preDispatchMessageCount),
    assignee
  );
  let proofMessage = freshAssigneeMessage;
  let worklogValid = proofMessage
    ? isStructuredWorklog(String(proofMessage.content || ""), {
        requirePath: false,
      })
    : false;

  if (!worklogValid) {
    await relaySpecialistRunUpdate({
      taskId: task._id,
      task,
      specialist: assignee,
      result: retryResult,
      stepIndex,
      totalSteps: Math.max(1, orderedSteps.filter((step) => step.role === "specialist").length),
      workflowKind,
      nextHandoff: nextHandoffName,
    });
    postDispatchMessages = await q(api.messages.listByTask, { taskId: task._id });
    freshAssigneeMessage = latestAssigneeMessage(
      postDispatchMessages.slice(preDispatchMessageCount),
      assignee
    );
    proofMessage = freshAssigneeMessage;
    worklogValid = proofMessage
      ? isStructuredWorklog(String(proofMessage.content || ""), {
          requirePath: false,
        })
      : false;
  }

  const [postDispatchDocs, evidence] = await Promise.all([
    q(api.documents.list, { taskId: task._id }),
    inspectTaskEvidence(task._id),
  ]);
  const rawReportedFileEvidence = freshAssigneeMessage
    ? extractStructuredEvidencePaths(String(freshAssigneeMessage.content || ""))
    : [];
  const reportedFileEvidence = [...new Set(rawReportedFileEvidence.map((p) => String(p || "").trim()).filter(Boolean))];
  const projectLocalReportedFileEvidence = ensureProjectLocalEvidencePaths(task, reportedFileEvidence);
  const verifiableFileEvidence = reportedFileEvidence.filter((candidate) =>
    pathHasVerifiableArtifact(candidate)
  );
  const totalVerifiableFileEvidence = [
    ...new Set([
      ...verifiableFileEvidence,
      ...projectLocalReportedFileEvidence,
    ]),
  ];
  const missingReportedFileEvidence = reportedFileEvidence.filter((candidate) => {
    try {
      const resolved = path.resolve(candidate);
      return !fs.existsSync(resolved);
    } catch {
      return true;
    }
  });
  const hasFreshEvidence =
    Boolean(freshAssigneeMessage?._id) || Number(postDispatchDocs?.length ?? 0) > preDispatchDocCount;
  const hasOutputPathEvidence = (evidence.outputPaths || []).length > 0;
  const hasAssigneeEvidence = config.structuredWorklogRequired
    ? hasFreshEvidence && evidence.hasStructuredAssigneeEvidence
    : hasFreshEvidence && evidence.hasAssigneeEvidence;

  if (!hasFreshEvidence && isStrictAccountabilityGateEnabled()) {
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: "no_assignee_progress: blocked recovery run produced no fresh assignee evidence",
      nextAction: `Blocked: waiting on fresh evidence from ${assignee.name}`,
      comment:
        `Chief auto-recovery: ${assignee.name} dispatch completed but no new assignee comment/document was posted for this retry cycle.`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "blocked_no_fresh_evidence",
    });
    return true;
  }

  if (config.structuredWorklogRequired && !worklogValid && isStrictAccountabilityGateEnabled()) {
    const pathIssue = pathRequiredTask
      ? deriveOutputPathEvidenceFailure(
          evidence,
          "blocked recovery run still missing canonical Artifact Folder evidence"
        )
      : null;
    const structuredReason =
      pathIssue?.reason ||
      "invalid_worklog_schema: blocked recovery run still missing structured worklog";
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: structuredReason,
      nextAction: pathIssue
        ? isInvalidOutputPathIssue(pathIssue.code)
          ? `Blocked: ${assignee.name} must fix invalid path references and provide verifiable Artifact Folder evidence`
          : `Blocked: ${assignee.name} must provide verifiable Artifact Folder evidence in structured worklog`
        : `Blocked: ${assignee.name} must post structured worklog before handoff`,
      comment:
        `Chief auto-recovery validation failed for ${assignee.name}.\n` +
        `Required fields: Objective, Actions Taken, Findings, Evidence, Blockers, Next Handoff` +
        `${pathIssue ? ", plus verifiable Artifact Folder evidence." : "."}`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "blocked_invalid_worklog",
    });
    return true;
  }

  if (!hasAssigneeEvidence && isStrictAccountabilityGateEnabled()) {
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: "no_assignee_progress: blocked recovery run posted no usable assignee evidence",
      nextAction: `Blocked: waiting on concrete evidence from ${assignee.name}`,
      comment:
        `Chief auto-recovery: ${assignee.name} run completed but no concrete evidence was detected in comments/docs.`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "blocked_missing_evidence",
    });
    return true;
  }

  if (
    pathRequiredTask &&
    reportedFileEvidence.length > 0 &&
    totalVerifiableFileEvidence.length === 0 &&
    !hasOutputPathEvidence &&
    (evidence.reportedOutputPaths?.length ?? 0) === 0 &&
    isStrictAccountabilityGateEnabled()
  ) {
    const sampleMissing = missingReportedFileEvidence.slice(0, 4).join(", ");
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: sampleMissing
        ? `no_verifiable_file_evidence: reported files not found on disk (${sampleMissing})`
        : "no_verifiable_file_evidence: reported files not found on disk",
      nextAction: `Blocked: ${assignee.name} must provide real file evidence that exists on disk`,
      comment:
        `Chief auto-recovery: ${assignee.name} reported file evidence, but none of the referenced files exist on disk. ` +
        `Create the files first, then repost structured evidence with real absolute file paths.`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome: "blocked_no_verifiable_file_evidence",
    });
    return true;
  }

  if (pathRequiredTask && !hasOutputPathEvidence && isStrictAccountabilityGateEnabled()) {
    const pathIssue =
      deriveOutputPathEvidenceFailure(
        evidence,
        "blocked recovery run is missing final canonical Artifact Folder evidence"
      ) || {
        code: "artifact_folder_empty",
        reason: "artifact_folder_empty: blocked recovery run is missing final canonical Artifact Folder evidence",
      };
    const missingPathFingerprint =
      isInvalidOutputPathIssue(pathIssue.code)
        ? [...new Set((evidence.reportedOutputPaths || []).map((p) => String(p).trim()).filter(Boolean))]
            .sort()
            .join("|")
        : "";
    const sameMissingPathFingerprint =
      missingPathFingerprint.length > 0 &&
      missingPathFingerprint === String(recoveryState.lastMissingPathFingerprint || "");
    const repeatedMissingPathCount =
      isInvalidOutputPathIssue(pathIssue.code)
        ? sameMissingPathFingerprint
          ? Number(recoveryState.repeatedMissingPathCount || 0) + 1
          : 1
        : 0;
    if (isInvalidOutputPathIssue(pathIssue.code)) {
      updateBlockedRecoveryState(task._id, {
        lastMissingPathFingerprint: missingPathFingerprint,
        repeatedMissingPathCount,
      });
      if (repeatedMissingPathCount >= 2) {
        const alternate = await findAvailableRecoverySpecialist(task, agents, assignee._id);
        if (alternate && String(alternate._id) !== String(assignee._id)) {
          await rewriteStepAssignee(task._id, steps, stepIndex, alternate);
          const switched = await ensureRunningStepStart(task._id, stepIndex, alternate._id);
          if (switched?.ok || switched?.alreadyRunning) {
            await m(api.tasks.assign, {
              id: task._id,
              assigneeIds: [alternate._id],
              agentName: chief.name,
            });
            await m(api.tasks.updateStatus, {
              id: task._id,
              status: "in_progress",
              agentId: chief._id,
              agentName: chief.name,
            });
            await m((api).automation.updateTaskAutomationState, {
              taskId: task._id,
              automationState: "executing",
              reviewStatus: task.reviewStatus ?? "changes_requested",
              nextAction:
                `Recovery reassigned after repeated invalid path evidence: ` +
                `${assignee.name} -> ${alternate.name}`,
            });
            await m((api).automation.setTaskNextCheck, {
              taskId: task._id,
              nextCheckAt: Date.now() + 2 * 60 * 1000,
              nextAction: `Execution resumed by ${alternate.name} after repeated invalid path evidence`,
              chiefAgentId: chief._id,
            });
            await m((api).messages.create, {
              taskId: task._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              kind: "handoff",
              stepIndex,
              workflowKind,
              content:
                `Chief auto-recovery reassignment: repeated invalid path evidence from ${assignee.name}. ` +
                `Step ${stepIndex} moved to ${alternate.name}.`,
            });
            updateBlockedRecoveryState(task._id, {
              attempts: 1,
              lastAttemptAt: Date.now(),
              lastReasonCode: blockedCode,
              lastOutcome: `recovery_reassigned_invalid_path:${assignee.name}->${alternate.name}`,
            });
            return true;
          }
        }
        const sampleMissing = (evidence.reportedOutputPaths || []).slice(0, 2).join(", ");
        await blockTaskWithStep({
          task,
          chief,
          stepIndex,
          reason: sampleMissing
            ? `no_assignee_progress: repeated invalid_output_path_evidence for same path (${sampleMissing})`
            : "no_assignee_progress: repeated invalid_output_path_evidence for same path",
          nextAction:
            `Blocked: ${assignee.name} must post new verified Artifact Folder evidence (same invalid path evidence was repeated)`,
          comment:
            `Chief auto-recovery paused: ${assignee.name} repeated the same invalid output path evidence. ` +
            `Create/fix deliverables in the canonical Artifact Folder and repost verified evidence before retrying.`,
          nextCheckInMinutes: Math.max(5, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
        });
        updateBlockedRecoveryState(task._id, {
          lastOutcome: "recovery_paused_repeated_output_path_not_found",
        });
        return true;
      }
    }
    await blockTaskWithStep({
      task,
      chief,
      stepIndex,
      reason: pathIssue.reason,
      nextAction:
        pathIssue.code === "artifact_path_not_found"
          ? `Blocked: ${assignee.name} must regenerate deliverables in the canonical artifact folder`
          : pathIssue.code === "artifact_folder_empty"
            ? `Blocked: ${assignee.name} must write verifiable deliverable files into the canonical artifact folder`
            : isInvalidOutputPathIssue(pathIssue.code)
          ? `Blocked: ${assignee.name} must provide valid deliverables in canonical artifact folder (or corrected path)`
          : `Blocked: ${assignee.name} must provide verifiable Artifact Folder evidence`,
      comment:
        pathIssue.code === "artifact_path_not_found"
          ? `Chief auto-recovery: canonical artifact folder is missing on disk. ` +
            `Recreate outputs in the auto-managed task artifact folder, then post a structured worklog with evidence.`
          : pathIssue.code === "artifact_folder_empty"
            ? `Chief auto-recovery: canonical artifact folder exists but contains no verifiable deliverable files. ` +
              `Write the deliverable files there and post structured evidence to unblock handoff.`
          : isInvalidOutputPathIssue(pathIssue.code)
          ? `Chief auto-recovery: ${assignee.name} posted a path reference, but the path is missing or has no verifiable deliverable files. ` +
            `Create the deliverable in the canonical Artifact Folder (or repost a corrected existing path) inside project scope.`
          : `Chief auto-recovery: ${assignee.name} posted progress but final artifact evidence is still missing. ` +
            `Populate the canonical Artifact Folder with verifiable files.`,
      nextCheckInMinutes: Math.max(1, Math.ceil(config.blockedRecoveryCooldownMs / 60000)),
    });
    updateBlockedRecoveryState(task._id, {
      lastOutcome:
        pathIssue.code === "artifact_path_not_found"
          ? "blocked_artifact_path_not_found"
          : pathIssue.code === "artifact_folder_empty"
            ? "blocked_artifact_folder_empty"
            : isInvalidOutputPathIssue(pathIssue.code)
              ? "blocked_output_path_not_found"
              : "blocked_missing_output_path",
    });
    return true;
  }

  const summaryAfterRun = summarizeOpenClawRunOutput(retryResult);
  await recordAccountabilityProof({
    taskId: task._id,
    stepIndex,
    summary: summaryAfterRun.lines.join(" | "),
    paths: evidence.outputPaths ?? [],
    proofMessageId: proofMessage?._id,
    proofDocumentIds: [],
    dispatchRunId,
  });

  const refreshedSteps = await listAccountabilitySteps(task._id);
  const refreshedOrdered = [...(refreshedSteps || [])].sort(
    (a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0)
  );
  const refreshedNext = refreshedOrdered.find((step) => Number(step.stepIndex) === stepIndex + 1) || null;

  if (refreshedNext?.role === "reviewer") {
    const reviewer =
      agents.byId.get(String(refreshedNext.agentId || "")) ||
      agents.byName.get(config.reviewerAgentName);
    if (reviewer) {
      await handoffAccountabilityStep(
        task._id,
        stepIndex,
        Number(refreshedNext.stepIndex),
        chief.name,
        true
      );
      await m((api).automation.submitForReview, {
        taskId: task._id,
        reviewerAgentId: reviewer._id,
        requesterAgentId: chief._id,
        requesterAgentName: chief.name,
        note:
          `Chief auto-recovery resolved blocked step for '${task.title}' and submitted the task for review.`,
      });
      await m((api).messages.create, {
        taskId: task._id,
        fromAgentId: chief._id,
        fromName: chief.name,
        kind: "handoff",
        stepIndex,
        workflowKind,
        content:
          `Chief auto-recovery: ${assignee.name} posted valid evidence and the task was auto-submitted to ${reviewer.name} for review.`,
      });
      clearBlockedRecoveryState(task._id);
      return true;
    }
  }

  if (refreshedNext?.role === "specialist") {
    const nextSpecialist = agents.byId.get(String(refreshedNext.agentId || ""));
    if (nextSpecialist?._id) {
      const nextStarted = await ensureRunningStepStart(
        task._id,
        Number(refreshedNext.stepIndex),
        nextSpecialist._id
      );
      if (nextStarted?.ok || nextStarted?.alreadyRunning) {
        await handoffAccountabilityStep(
          task._id,
          stepIndex,
          Number(refreshedNext.stepIndex),
          chief.name,
          true
        );
        await m(api.tasks.assign, {
          id: task._id,
          assigneeIds: [nextSpecialist._id],
          agentName: chief.name,
        });
        await m(api.tasks.updateStatus, {
          id: task._id,
          status: "in_progress",
          agentId: chief._id,
          agentName: chief.name,
        });
        await m((api).automation.updateTaskAutomationState, {
          taskId: task._id,
          automationState: "executing",
          reviewStatus: task.reviewStatus ?? "pending",
          nextAction: `Execution resumed after recovery: ${nextSpecialist.name} is now running`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: task._id,
          nextCheckAt: Date.now() + 2 * 60 * 1000,
          nextAction: `Execution in progress by ${nextSpecialist.name} after blocked-step recovery`,
          chiefAgentId: chief._id,
        });
        await m((api).messages.create, {
          taskId: task._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          kind: "handoff",
          stepIndex: Number(refreshedNext.stepIndex),
          workflowKind,
          content:
            `Chief auto-recovery: ${assignee.name} evidence accepted. Handoff completed to ${nextSpecialist.name}.`,
        });
        clearBlockedRecoveryState(task._id);
        return true;
      }
    }
  }

  await m((api).automation.setTaskNextCheck, {
    taskId: task._id,
    nextCheckAt: Date.now() + 2 * 60 * 1000,
    nextAction: `Execution resumed after blocked recovery by ${assignee.name}`,
    chiefAgentId: chief._id,
  });
  await m((api).messages.create, {
    taskId: task._id,
    fromAgentId: chief._id,
    fromName: chief.name,
    kind: "system",
    stepIndex,
    workflowKind,
    content: `Chief auto-recovery: blocked step resolved by ${assignee.name}; monitoring resumed.`,
  });
  clearBlockedRecoveryState(task._id);
  return true;
}

async function pmSchedulerLoop(signal) {
  markLoopHeartbeat("pmScheduler", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("pmScheduler", { status: "loop" });
      if (!config.hierarchicalPmWorkflowEnabled) {
        await sleep(Math.max(2000, config.chiefMonitorIntervalMs));
        continue;
      }

      const [agentsMap, allTasks] = await Promise.all([getAgentMap(), q(api.tasks.list, {})]);
      const chief = findAgentByNames(
        agentsMap,
        config.strictRoleRouting ? [config.chiefAgentName, "Chief"] : [config.chiefAgentName, "Chief", "Jarvis"]
      );
      const pmTasks = (allTasks || []).filter((task) => {
        const model = normalizeOrchestrationModel(task);
        if (model !== "chief_pm_parallel") return false;
        return ["assigned", "in_progress", "review", "blocked", "waiting"].includes(String(task.status || ""));
      });

      for (const task of pmTasks) {
        await ensureTaskArtifactRootReady(task);
        let currentTask = (await q(api.tasks.get, { id: task._id })) || task;
        let nodes = await listGraphNodes(currentTask._id);
        if ((nodes || []).length === 0 && chief) {
          try {
            const initialized = await ensureChiefPmGraph(currentTask, agentsMap, chief);
            nodes = initialized.graphNodes || [];
            currentTask = (await q(api.tasks.get, { id: task._id })) || currentTask;
          } catch (error) {
            const message = String(error?.message || error || "unknown error");
            if (isExecutionGraphApiUnavailableError(error) || /execution_graph_unavailable/i.test(message)) {
              if (config.strictRoleRouting || config.strictPmAgentRequired) {
                await m(api.tasks.updateStatus, {
                  id: currentTask._id,
                  status: "blocked",
                  agentId: chief?._id,
                  agentName: chief?.name || config.chiefAgentName,
                });
                await m((api).automation.updateTaskAutomationState, {
                  taskId: currentTask._id,
                  automationState: "errored",
                  reviewStatus: "pending",
                  nextAction:
                    "Blocked: PM execution graph unavailable under STRICT_ROLE_ROUTING (legacy downgrade disabled).",
                });
                await emitExecutionEvent({
                  taskId: currentTask._id,
                  actorAgentId: chief?._id,
                  actorName: chief?.name || config.chiefAgentName,
                  actorRole: "chief",
                  kind: "recovery",
                  severity: "error",
                  title: "PM workflow blocked (strict routing)",
                  summary: "executionGraph unavailable and legacy fallback disabled",
                  workDone: "Chief blocked PM task because strict routing disallows downgrade.",
                  workingNow: "Task is blocked awaiting graph API availability.",
                  nextSteps: "Deploy executionGraph module and reopen task.",
                  blockers: message,
                });
              } else {
                await m(api.tasks.updateWorkflowMeta, {
                  id: currentTask._id,
                  workflowKind: resolveTaskWorkflowKind(currentTask),
                  workflowCommand: currentTask.workflowCommand,
                  workflowVersion: Number(currentTask.workflowVersion ?? 1),
                  nextAction:
                    "PM graph APIs unavailable on current deployment. Falling back to legacy sequential execution.",
                  orchestrationModel: "legacy_sequential",
                });
                await emitExecutionEvent({
                  taskId: currentTask._id,
                  actorAgentId: chief?._id,
                  actorName: chief?.name || config.chiefAgentName,
                  actorRole: "chief",
                  kind: "recovery",
                  severity: "warning",
                  title: "PM workflow downgraded to legacy",
                  summary: "executionGraph functions unavailable; switched to legacy_sequential",
                  workDone: "Chief downgraded orchestration model to keep task progressing.",
                  workingNow: "Task will be picked by legacy chief triage/dispatch path.",
                  nextSteps: "Deploy executionGraph module to re-enable PM mode.",
                  blockers: message,
                });
              }
              continue;
            }
            await emitExecutionEvent({
              taskId: currentTask._id,
              actorAgentId: chief?._id,
              actorName: chief?.name || config.chiefAgentName,
              actorRole: "chief",
              kind: "recovery",
              severity: "error",
              title: "PM graph initialization failed",
              summary: message,
              workDone: "Graph initialization attempted during PM scheduler pass.",
              workingNow: "Task remains queued for next retry.",
              nextSteps: "Fix missing dependency/agent mapping and retry.",
              blockers: message,
            });
            continue;
          }
        }

        const recomputed = await recomputeGraphRunnable(currentTask._id);
        nodes = recomputed?.nodes ?? nodes;

        const blockedNodes = (nodes || []).filter((node) =>
          ["blocked", "failed"].includes(String(node.status || ""))
        );
        if (config.chiefAutoRecoverStaleNode && chief && blockedNodes.length > 0) {
          const taskRuns = await q((api).automation.listAutomationRunsByTask, {
            taskId: currentTask._id,
          });
          for (const blockedNode of blockedNodes) {
            const blockedReason = String(blockedNode.stuckReason || "");
            const blockedNodeKey = normalizeGraphNodeKey(blockedNode.nodeKey);
            if (blockedNodeKey === "reviewer" && isReviewerReworkReason(blockedReason)) {
              const routed = await routePmReviewerRework({
                task: currentTask,
                reviewerNode: blockedNode,
                nodes,
                agentsMap,
                chief,
                summary: "Reviewer requested changes; routing specialist rework.",
                findings: [blockedReason],
                outputPaths: normalizeEvidencePaths(blockedNode.proofPaths || []),
                trigger: "watchdog_recovery",
              });
              if (routed) continue;
            }
            const retries = Number(blockedNode.retryCount ?? 0);
            const latestFailedRun = latestFailedExecutionRunForNode(taskRuns, blockedNode);
            const transientDispatchFailure =
              isTransientDispatchFailureReason(blockedNode.stuckReason) ||
              isTransientDispatchFailureText(
                `${String(latestFailedRun?.error || "")}\n${String(latestFailedRun?.outputSummary || "")}`
              );
            if (retries >= config.chiefNodeRetryBudget && !transientDispatchFailure) continue;
            const fallbackAgent =
              !transientDispatchFailure && retries >= 1
                ? await findFallbackExecutionNodeAgent(blockedNode, agentsMap, currentTask._id)
                : null;
            if (fallbackAgent) {
              await m((api).executionGraph.reassignNodeAgent, {
                taskId: currentTask._id,
                nodeKey: blockedNode.nodeKey,
                newAgentId: fallbackAgent._id,
                newAgentName: fallbackAgent.name,
                reason: `chief_auto_recover_fallback_agent:${fallbackAgent.name}`,
              });
              await emitExecutionEvent({
                taskId: currentTask._id,
                actorAgentId: chief._id,
                actorName: chief.name,
                actorRole: "chief",
                kind: "recovery",
                severity: "warning",
                title: "Chief reassigned blocked PM node",
                summary: `${blockedNode.agentName} -> ${fallbackAgent.name}`,
                workDone: "Blocked node moved to alternate mapped agent for retry.",
                workingNow: `Fallback reassignment after retry ${retries}/${config.chiefNodeRetryBudget}.`,
                nextSteps: "PM scheduler will dispatch reassigned node immediately.",
                blockers: String(blockedNode.stuckReason || ""),
                detailsJson: {
                  nodeKey: blockedNode.nodeKey,
                  fromAgentId: blockedNode.agentId,
                  toAgentId: fallbackAgent._id,
                  toAgentName: fallbackAgent.name,
                },
              });
              continue;
            }
            await m((api).executionGraph.resetNodeForRetry, {
              taskId: currentTask._id,
              nodeKey: blockedNode.nodeKey,
              reason: transientDispatchFailure
                ? `dispatch_retry_cooldown: transient dispatch failure for ${blockedNode.agentName}`
                : `chief_auto_recover_retry_${retries + 1}`,
              incrementRetry: transientDispatchFailure ? false : undefined,
            });
            await emitExecutionEvent({
              taskId: currentTask._id,
              actorAgentId: chief._id,
              actorName: chief.name,
              actorRole: "chief",
              kind: "recovery",
              severity: "warning",
              title: "Chief reset blocked PM node",
              summary: transientDispatchFailure
                ? `${blockedNode.agentName} transient dispatch failure; cooldown retry queued`
                : `${blockedNode.agentName} node reset for retry`,
              workDone: "Blocked node moved back to runnable for automatic retry.",
              workingNow: transientDispatchFailure
                ? "Transient provider/auth cooldown detected; retry queued without consuming retry budget."
                : `Retry ${retries + 1}/${config.chiefNodeRetryBudget} queued.`,
              nextSteps: "PM scheduler will redispatch node on next pass.",
              blockers: String(blockedNode.stuckReason || ""),
              detailsJson: {
                nodeKey: blockedNode.nodeKey,
                retryCount: transientDispatchFailure ? retries : retries + 1,
                transientDispatchFailure,
              },
            });
          }
          nodes = (await listGraphNodes(currentTask._id)) || nodes;
        }

        const schedulerNow = Date.now();
        const runnableNodes = (nodes || []).filter((node) => String(node.status) === "runnable");
        const dispatchableNodes = runnableNodes.filter((node) => !isNodeInDispatchCooldown(node, schedulerNow));
        await Promise.all(
          dispatchableNodes.map(async (node) => {
            await dispatchParallelNode({
              task: currentTask,
              node,
              agentsMap,
              chief,
            });
          })
        );

        const refreshedNodes = await listGraphNodes(currentTask._id);
        const runningNodes = (refreshedNodes || []).filter((node) => String(node.status) === "running");
        if (config.nodeHeartbeatEnabled && chief && runningNodes.length > 0) {
          for (const node of runningNodes) {
            const heartbeatKey = executionNodeInFlightKey(currentTask._id, node.nodeKey);
            const now = Date.now();
            const lastBeat = Number(lastExecutionHeartbeatByStep.get(heartbeatKey) ?? 0);
            const minIntervalMs = config.nodeHeartbeatMinutes * 60 * 1000;
            if (lastBeat > 0 && now - lastBeat < minIntervalMs) continue;
            const runner = resolveExecutionNodeAgent(node, agentsMap);
            await m((api).executionGraph.heartbeatNode, {
              taskId: currentTask._id,
              nodeKey: node.nodeKey,
              workingNow: `Node ${node.agentName} still running under PM supervision`,
            });
            await emitExecutionEvent({
              taskId: currentTask._id,
              actorAgentId: runner?._id,
              actorName: runner?.name || node.agentName,
              actorRole:
                node.role === "reviewer"
                  ? "reviewer"
                  : node.role === "project_manager"
                    ? "project_manager"
                    : "specialist",
              kind: "heartbeat",
              severity: "info",
              title: `${node.agentName} heartbeat`,
              summary: `Node ${node.nodeKey} still running`,
              workDone: node.workDone || "",
              workingNow: node.workingNow || "Execution in progress.",
              nextSteps: node.nextSteps || "Continue current node work and publish milestone evidence.",
              blockers: node.blockers || "",
              evidencePaths: normalizeEvidencePaths(node.proofPaths || []),
            });
            lastExecutionHeartbeatByStep.set(heartbeatKey, now);
          }
        }

        await refreshPmTaskState(currentTask, agentsMap, chief);
      }
    } catch (error) {
      console.error("[pm-scheduler] error", error);
      recordRuntimeError("pmScheduler", error);
      markLoopHeartbeat("pmScheduler", { status: "error" });
    }
    await sleep(Math.max(2000, Math.min(config.chiefMonitorIntervalMs, 15 * 1000)));
  }
  markLoopHeartbeat("pmScheduler", { status: "stopped" });
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
      const candidatesById = new Map((due ?? []).map((task) => [String(task._id), task]));
      if (config.accountabilityLedgerEnabled) {
        const staleEntries = await q((api).accountability.stuckTasks, {
          staleMinutes: config.accountabilityStepStaleMinutes,
          limit: 50,
        });
        for (const entry of staleEntries ?? []) {
          const staleTask = entry?.task;
          if (!staleTask?._id) continue;
          if (!candidatesById.has(String(staleTask._id))) {
            candidatesById.set(String(staleTask._id), staleTask);
          }
        }
      }
      if (config.taskStepStateReconcile) {
        const allTasks = await q(api.tasks.list, {});
        pruneBlockedRecoveryState(new Set((allTasks ?? []).map((task) => String(task?._id || ""))));
        for (const candidate of allTasks) {
          if (!["in_progress", "blocked", "assigned", "review", "waiting", "done"].includes(String(candidate.status))) {
            continue;
          }
          if (!candidatesById.has(String(candidate._id))) {
            candidatesById.set(String(candidate._id), candidate);
          }
        }
      }
      for (const task of candidatesById.values()) {
        if (isChiefPmParallelTask(task)) {
          const refreshedTask = (await q(api.tasks.get, { id: task._id })) || task;
          const nodes = await listGraphNodes(refreshedTask._id);
          if ((nodes || []).length > 0) {
            const taskRuns = await q((api).automation.listAutomationRunsByTask, {
              taskId: refreshedTask._id,
            });
            const staleThresholdMs = config.accountabilityStepStaleMinutes * 60 * 1000;
            const staleRunning = (nodes || []).filter((node) => {
              if (String(node.status) !== "running") return false;
              const last = Number(node.lastProgressAt ?? node.startedAt ?? node.updatedAt ?? 0);
              if (!last) return false;
              return Date.now() - last >= staleThresholdMs;
            });
            for (const node of staleRunning) {
              const retries = Number(node.retryCount ?? 0);
              const latestFailedRun = latestFailedExecutionRunForNode(taskRuns, node);
              const transientDispatchFailure =
                isTransientDispatchFailureReason(node.stuckReason) ||
                isTransientDispatchFailureText(
                  `${String(latestFailedRun?.error || "")}\n${String(latestFailedRun?.outputSummary || "")}`
                );
              const hasActiveRun = hasActiveExecutionRunForNode(taskRuns, node);

              if (!hasActiveRun && config.chiefAutoRecoverStaleNode) {
                await m((api).executionGraph.resetNodeForRetry, {
                  taskId: refreshedTask._id,
                  nodeKey: node.nodeKey,
                  reason: "dispatch_orphaned_running_state: no active execution run found for running node",
                  incrementRetry: false,
                });
                await emitExecutionEvent({
                  taskId: refreshedTask._id,
                  actorAgentId: chief._id,
                  actorName: chief.name,
                  actorRole: "chief",
                  kind: "recovery",
                  severity: "warning",
                  title: "Chief recovered orphan PM running node",
                  summary: `${node.agentName} running node had no active dispatch run`,
                  workDone: "Recovered inconsistent running node state by resetting node to runnable.",
                  workingNow: "Node is queued for immediate PM redispatch.",
                  nextSteps: "PM scheduler will redispatch and validate fresh run lifecycle.",
                  blockers: String(node.stuckReason || ""),
                  detailsJson: {
                    nodeKey: node.nodeKey,
                    retryCount: retries,
                    recoveredWithoutRetryIncrement: true,
                  },
                });
                continue;
              }

              if (
                config.chiefAutoRecoverStaleNode &&
                (retries < config.chiefNodeRetryBudget || transientDispatchFailure)
              ) {
                const fallbackAgent =
                  !transientDispatchFailure && retries >= 1
                    ? await findFallbackExecutionNodeAgent(node, agents, refreshedTask._id)
                    : null;
                if (fallbackAgent) {
                  await m((api).executionGraph.reassignNodeAgent, {
                    taskId: refreshedTask._id,
                    nodeKey: node.nodeKey,
                    newAgentId: fallbackAgent._id,
                    newAgentName: fallbackAgent.name,
                    reason: `no_assignee_progress: stale node fallback reassigned to ${fallbackAgent.name}`,
                  });
                  await emitExecutionEvent({
                    taskId: refreshedTask._id,
                    actorAgentId: chief._id,
                    actorName: chief.name,
                    actorRole: "chief",
                    kind: "recovery",
                    severity: "warning",
                    title: "Chief reassigned stale PM node",
                    summary: `${node.agentName} -> ${fallbackAgent.name} after stale retry`,
                    workDone: "Stale node reassigned to alternate mapped agent.",
                    workingNow: `Fallback reassignment after retry ${retries}/${config.chiefNodeRetryBudget}.`,
                    nextSteps: "PM scheduler will dispatch reassigned node.",
                    blockers: String(node.stuckReason || ""),
                    detailsJson: {
                      nodeKey: node.nodeKey,
                      fromAgentId: node.agentId,
                      toAgentId: fallbackAgent._id,
                      toAgentName: fallbackAgent.name,
                    },
                  });
                  continue;
                }
                await m((api).executionGraph.resetNodeForRetry, {
                  taskId: refreshedTask._id,
                  nodeKey: node.nodeKey,
                  reason: transientDispatchFailure
                    ? `dispatch_retry_cooldown: stale node with transient dispatch failure for ${node.agentName}`
                    : `no_assignee_progress: stale node watchdog retry ${retries + 1}`,
                  incrementRetry: transientDispatchFailure ? false : undefined,
                });
                await emitExecutionEvent({
                  taskId: refreshedTask._id,
                  actorAgentId: chief._id,
                  actorName: chief.name,
                  actorRole: "chief",
                  kind: "recovery",
                  severity: "warning",
                  title: "Chief retried stale PM node",
                  summary: transientDispatchFailure
                    ? `${node.agentName} stale with transient dispatch failure; cooldown retry queued`
                    : `${node.agentName} stale > ${config.accountabilityStepStaleMinutes}m`,
                  workDone: "Stale running node converted back to runnable for retry.",
                  workingNow: transientDispatchFailure
                    ? "Transient provider/auth cooldown detected; retry queued without consuming retry budget."
                    : `Retry ${retries + 1}/${config.chiefNodeRetryBudget} armed.`,
                  nextSteps: "PM scheduler will redispatch node immediately.",
                  blockers: String(node.stuckReason || ""),
                  detailsJson: {
                    nodeKey: node.nodeKey,
                    retryCount: transientDispatchFailure ? retries : retries + 1,
                    transientDispatchFailure,
                  },
                });
              } else {
                await m((api).executionGraph.blockNode, {
                  taskId: refreshedTask._id,
                  nodeKey: node.nodeKey,
                  reason: `no_assignee_progress: stale node exceeded retry budget (${config.chiefNodeRetryBudget})`,
                });
                await emitExecutionEvent({
                  taskId: refreshedTask._id,
                  actorAgentId: chief._id,
                  actorName: chief.name,
                  actorRole: "chief",
                  kind: "recovery",
                  severity: "error",
                  title: "Chief blocked stale PM node",
                  summary: `${node.agentName} exceeded stale retry budget`,
                  workDone: "Node moved to blocked after retry budget exhaustion.",
                  workingNow: "Waiting for manual intervention or policy change.",
                  nextSteps: "Adjust dependency/agent availability and retry.",
                  blockers: String(node.stuckReason || ""),
                });
              }
            }
            await refreshPmTaskState(refreshedTask, agents, chief);
          }
          continue;
        }
        await backfillAccountabilityForTask(task, agents);
        let currentTask = task;
        await reconcileTaskStepConsistency(currentTask, chief);
        currentTask = (await q(api.tasks.get, { id: task._id })) || currentTask;
        if (String(currentTask.status) !== "blocked") {
          clearBlockedRecoveryState(currentTask._id);
        }
        if (currentTask.status === "done") {
          await reconcileDoneTaskAccountability(currentTask, chief);
          currentTask = (await q(api.tasks.get, { id: task._id })) || currentTask;
          const recentlyTouchedAt = Math.max(
            Number(currentTask.lastChiefCheckAt ?? 0),
            Number(currentTask.lastAssigneeUpdateAt ?? 0),
            Number(currentTask._creationTime ?? 0)
          );
          const withinIntegrityWindow = Date.now() - recentlyTouchedAt < 24 * 60 * 60 * 1000;
          if (withinIntegrityWindow) {
            const reopened = await enforceDoneDeliverableIntegrity(currentTask, agents);
            if (reopened) continue;
          }
          // Done tasks are terminal for watchdog follow-up/escalation unless integrity reopens them.
          continue;
        }
        if (currentTask.status === "review" && config.autoReviewEnabled) {
          await handleReviewTask(currentTask, agents);
          continue;
        }
        if (currentTask.status === "blocked") {
          const recovered = await attemptBlockedTaskAutoRecovery(currentTask, chief, agents);
          if (recovered) {
            continue;
          }
        }
        if (currentTask.status === "in_progress") {
          const reviewer = agents.byName.get(config.reviewerAgentName);
          const health = config.accountabilityLedgerEnabled
            ? await q((api).accountability.taskHealth, {
                taskId: currentTask._id,
                staleMinutes: config.accountabilityStepStaleMinutes,
              })
            : null;
          const runningStep = health?.runningStep;
          const runningStepAssignee = runningStep
            ? agents.byId.get(String(runningStep.agentId))
            : null;
          if (runningStep) {
            await maybeEmitRunningStepHeartbeat(currentTask, runningStep, runningStepAssignee);
          }
          if (health?.stale && runningStep) {
            const stuckReason = `no_assignee_progress: no specialist proof in last ${config.accountabilityStepStaleMinutes}m`;
            await blockTaskWithStep({
              task: currentTask,
              chief,
              stepIndex: Number(runningStep.stepIndex),
              reason: stuckReason,
              nextAction: `Blocked by accountability watchdog: ${runningStep.agentName} is stale`,
              comment:
                `Chief watchdog: ${runningStep.agentName} step is stale for more than ${config.accountabilityStepStaleMinutes} minutes. ` +
                `Task moved to blocked until assignee posts concrete evidence.`,
            });
            if (!config.telegramDigestEnabled && currentTask.source === "telegram" && currentTask.sourceRef?.chatId) {
              try {
                await sendTelegramText(
                  currentTask.sourceRef.chatId,
                  `Alert: Task #${String(currentTask._id)} blocked by watchdog (${runningStep.agentName} stale > ${config.accountabilityStepStaleMinutes}m).`,
                  undefined,
                  {
                    taskId: currentTask._id,
                    eventType: "watchdog_alert",
                    fingerprint: `${currentTask._id}:${runningStep.agentName}:stale`,
                  }
                );
              } catch (e) {
                console.error("[watchdog] telegram stale alert failed", e);
              }
            }
            continue;
          }
          const evidence = await inspectTaskEvidence(currentTask._id);
          const pathRequiredTask = taskRequiresOutputPathEvidence(currentTask);
          const hasOutputPathEvidence = evidence.outputPaths.length > 0;
          const hasReadyEvidence =
            (config.structuredWorklogRequired
              ? evidence.hasStructuredAssigneeEvidence
              : evidence.hasAssigneeEvidence) &&
            (!pathRequiredTask || hasOutputPathEvidence);
          const hasFreshEvidenceAfterReview =
            await hasFreshAssigneeEvidenceSinceFailedReview(currentTask);
          const reviewReadyEvidence = hasReadyEvidence && hasFreshEvidenceAfterReview;
          const assignee = (currentTask.assigneeIds ?? [])
            .map((id) => agents.byId.get(String(id)))
            .find(Boolean) ?? runningStepAssignee;
          const runs = await q((api).automation.listAutomationRunsByTask, { taskId: currentTask._id });
          const runningStepDispatchIds = new Set(
            ((runningStep?.dispatchRunIds ?? []) || []).map((id) => String(id))
          );
          const dispatchInFlightMaxMs = Math.max(
            config.openclawDispatchTimeoutMs + 2 * 60 * 1000,
            5 * 60 * 1000
          );
          const activeSpecialistRun = (runs ?? []).find((r) => {
            if (r.role !== "specialist") return false;
            if (!(r.dispatchType === "execution" || r.dispatchType === "monitor")) return false;
            if (!isInFlightAutomationStatus(r.status)) return false;
            const startedAt = Number(r.startedAt ?? r._creationTime ?? 0);
            if (startedAt > 0 && Date.now() - startedAt > dispatchInFlightMaxMs) return false;
            const hasTerminalForSameDispatch = (runs ?? []).some((doneRun) => {
              if (doneRun.role !== "specialist") return false;
              if (doneRun.dispatchType !== r.dispatchType) return false;
              if (!["succeeded", "failed"].includes(String(doneRun.status || ""))) return false;
              if (String(doneRun.agentName || "") !== String(r.agentName || "")) return false;
              const doneStartedAt = Number(doneRun.startedAt ?? doneRun._creationTime ?? 0);
              return doneStartedAt >= startedAt;
            });
            if (hasTerminalForSameDispatch) return false;
            if (runningStepDispatchIds.size === 0) return true;
            return runningStepDispatchIds.has(String(r._id));
          });
          const latestSpecialistRun = (runs ?? []).find(
            (r) =>
              r.role === "specialist" &&
              (r.dispatchType === "execution" || r.dispatchType === "monitor") &&
              (r.status === "succeeded" || r.status === "failed")
          );
          const lastSpecialistDispatchAt = Number(
            latestSpecialistRun?.finishedAt ?? latestSpecialistRun?.startedAt ?? 0
          );
          const lastChiefTouchAt = Number(currentTask.lastChiefCheckAt ?? 0);

          if (activeSpecialistRun) {
            const dispatchStartedAt = Number(
              activeSpecialistRun.startedAt ??
                activeSpecialistRun._creationTime ??
                runningStep?.startedAt ??
                Date.now()
            );
            const ageMinutes = Math.max(0, Math.floor((Date.now() - dispatchStartedAt) / 60000));
            await m((api).automation.setTaskNextCheck, {
              taskId: currentTask._id,
              nextCheckAt: Date.now() + Math.max(config.chiefMonitorIntervalMs, 60 * 1000),
              nextAction: `Execution in progress by ${assignee?.name ?? runningStep?.agentName ?? "assignee"} (dispatch running ${ageMinutes}m)`,
              chiefAgentId: chief._id,
            });
            continue;
          }

          if (
            config.autoRedispatchStaleExecutionEnabled &&
            assignee &&
            !reviewReadyEvidence &&
            lastChiefTouchAt > 0 &&
            lastSpecialistDispatchAt > 0 &&
            lastSpecialistDispatchAt < lastChiefTouchAt
          ) {
            const preDispatchTask = await q(api.tasks.get, { id: currentTask._id });
            const preDispatchMessages = await q(api.messages.listByTask, { taskId: currentTask._id });
            const preDispatchMessageCount = Number(preDispatchMessages?.length ?? 0);
            const retryPrompt =
              `Mission Control watchdog retry for task ${String(currentTask._id)} assigned to ${assignee.name}.\n` +
              `Role: ${assignee.role}\n` +
              `Task: ${currentTask.title}\n` +
              `Description:\n${currentTask.description}\n\n` +
              `Previous run did not produce valid deliverable evidence. ` +
              `Do the implementation work and post a concrete update in Mission Control comments/docs.` +
              (pathRequiredTask
                ? ` Store deliverables in the canonical auto-managed Artifact Folder under ${deliverablesRoot}/.... ` +
                  `Manual Output Path/Stored Location text is optional metadata.`
                : "");
            const retryAttempt = Number(currentTask.escalationLevel ?? 0) + 1;
            const retryDispatchStartedAt = Date.now();
            const retryRunId = await startAutomationRun({
              taskId: currentTask._id,
              role: "specialist",
              agentName: assignee.name,
              agentId: assignee._id,
              dispatchType: "monitor",
              attempt: retryAttempt,
              inputSummary: `Watchdog retry dispatch to ${assignee.name}`,
            });
            if (runningStep) {
              await attachDispatchRunToStep(currentTask._id, Number(runningStep.stepIndex), retryRunId);
            }

            const retryResult = await runOpenClawAgent({
              role: "specialist",
              task: currentTask,
              prompt: retryPrompt,
              targetAgent: assignee,
            });
            const retryRunFinalId = await finishAutomationRun({
              taskId: currentTask._id,
              role: "specialist",
              agentName: assignee.name,
              agentId: assignee._id,
              dispatchType: "monitor",
              attempt: retryAttempt,
              inputSummary: `Watchdog retry dispatch to ${assignee.name}`,
              startedAt: retryDispatchStartedAt,
              result: retryResult,
              successSummary: "Watchdog redispatch invoked",
              failureSummary: "Watchdog redispatch failed",
            });
            if (runningStep) {
              await attachDispatchRunToStep(
                currentTask._id,
                Number(runningStep.stepIndex),
                retryRunFinalId
              );
            }

            if (retryResult.code === 0) {
              await m((api).automation.recordAssigneeHeartbeat, {
                taskId: currentTask._id,
                agentId: assignee._id,
                agentName: assignee.name,
                note: `Chief watchdog re-dispatched ${assignee.name} after stale execution state`,
              });
              await m(api.agents.updateStatus, {
                id: assignee._id,
                status: "active",
                currentTaskId: currentTask._id,
              });
              const postDispatchMessages = await q(api.messages.listByTask, { taskId: currentTask._id });
              const specialistCommentPosted = (postDispatchMessages ?? [])
                .slice(preDispatchMessageCount)
                .some(
                  (msg) =>
                    String(msg?.fromName || "").toLowerCase() ===
                    String(assignee.name || "").toLowerCase()
                );
              let hasFreshSpecialistEvidence = specialistCommentPosted;
              if (!specialistCommentPosted) {
                const relayed = await relaySpecialistRunUpdate({
                  taskId: currentTask._id,
                  task: currentTask,
                  specialist: assignee,
                  result: retryResult,
                  stepIndex: runningStep ? Number(runningStep.stepIndex) : 0,
                  totalSteps: 1,
                  workflowKind: resolveTaskWorkflowKind(currentTask),
                  nextHandoff: "Reviewer",
                });
                hasFreshSpecialistEvidence = hasFreshSpecialistEvidence || relayed;
              }
              const refreshedEvidence = await inspectTaskEvidence(currentTask._id);
              const refreshedHasOutput = refreshedEvidence.outputPaths.length > 0;
              const refreshedReady =
                hasFreshSpecialistEvidence &&
                (config.structuredWorklogRequired
                  ? refreshedEvidence.hasStructuredAssigneeEvidence
                  : refreshedEvidence.hasAssigneeEvidence) &&
                (!pathRequiredTask || refreshedHasOutput);
              const refreshedTask = (await q(api.tasks.get, { id: currentTask._id })) || currentTask;
              const refreshedFreshEvidenceAfterReview =
                await hasFreshAssigneeEvidenceSinceFailedReview(refreshedTask);
              const refreshedReviewReady = refreshedReady && refreshedFreshEvidenceAfterReview;
              if (runningStep) {
                const retryMessages = await q(api.messages.listByTask, { taskId: currentTask._id });
                const proofMessage = [...(retryMessages ?? []).slice(preDispatchMessageCount)]
                  .reverse()
                  .find(
                    (msg) =>
                      String(msg?.fromName || "").toLowerCase() ===
                      String(assignee.name || "").toLowerCase()
                  );
                await recordAccountabilityProof({
                  taskId: currentTask._id,
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
                refreshedReviewReady &&
                currentTask.reviewStatus !== "approved"
              ) {
                const refreshSteps = await listAccountabilitySteps(currentTask._id);
                const reviewerStep = refreshSteps.find((s) => s.role === "reviewer");
                if (runningStep && reviewerStep) {
                  await handoffAccountabilityStep(
                    currentTask._id,
                    Number(runningStep.stepIndex),
                    Number(reviewerStep.stepIndex),
                    chief.name,
                    true
                  );
                } else if (runningStep) {
                  await completeAccountabilityStep(
                    currentTask._id,
                    Number(runningStep.stepIndex),
                    `Watchdog accepted specialist evidence from ${assignee.name}.`
                  );
                }
                await m((api).automation.submitForReview, {
                  taskId: currentTask._id,
                  reviewerAgentId: reviewer._id,
                  requesterAgentId: chief._id,
                  requesterAgentName: chief.name,
                  note: `Chief watchdog auto-submitted '${currentTask.title}' for review after retry dispatch produced evidence-ready progress.`,
                });
                await m((api).messages.create, {
                  taskId: currentTask._id,
                  fromAgentId: chief._id,
                  fromName: chief.name,
                  content:
                    `Chief watchdog retry: ${assignee.name} posted evidence${pathRequiredTask ? " (including canonical artifact evidence)" : ""}. ` +
                    `Auto-submitting to ${reviewer.name} for review.`,
                });
                continue;
              }
              const retryReason = pathRequiredTask
                ? "No valid canonical Artifact Folder evidence after watchdog redispatch; requesting another specialist retry"
                : "No valid specialist evidence after watchdog redispatch; requesting another specialist retry";
              await m((api).automation.markTaskEscalated, {
                taskId: currentTask._id,
                chiefAgentId: chief._id,
                chiefAgentName: chief.name,
                reason: retryReason,
              });
              await m((api).automation.setTaskNextCheck, {
                taskId: currentTask._id,
                nextCheckAt: Date.now() + 5 * 60 * 1000,
                nextAction: pathRequiredTask
                  ? `Awaiting ${assignee.name} implementation evidence in canonical Artifact Folder after watchdog redispatch`
                  : `Awaiting ${assignee.name} evidence/update after watchdog redispatch`,
                chiefAgentId: chief._id,
              });
              await m((api).messages.create, {
                taskId: currentTask._id,
                fromAgentId: chief._id,
                  fromName: chief.name,
                  content:
                    `Chief watchdog retry: re-dispatched ${assignee.name} because the task stayed in Active without valid evidence. ` +
                  `Waiting for a concrete update${pathRequiredTask ? " with canonical Artifact Folder evidence" : ""}.`,
              });
              continue;
            } else {
              await blockTaskWithStep({
                task: currentTask,
                chief,
                stepIndex: runningStep ? Number(runningStep.stepIndex) : 0,
                reason: "dispatch_failed: watchdog redispatch failed",
                stepStatus: "failed",
                nextAction: `Blocked: watchdog redispatch failed for ${assignee.name}; investigate OpenClaw/Convex connectivity`,
                comment:
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
            reviewReadyEvidence &&
            currentTask.reviewStatus !== "approved"
          ) {
            const steps = await listAccountabilitySteps(currentTask._id);
            const currentRunning = findRunningStep(steps);
            const reviewerStep = steps.find((s) => s.role === "reviewer");
            if (currentRunning && reviewerStep) {
              await handoffAccountabilityStep(
                currentTask._id,
                Number(currentRunning.stepIndex),
                Number(reviewerStep.stepIndex),
                chief.name,
                true
              );
            } else if (currentRunning) {
              await completeAccountabilityStep(
                currentTask._id,
                Number(currentRunning.stepIndex),
                "Watchdog accepted evidence and submitted for review."
              );
            }
            await m((api).automation.submitForReview, {
              taskId: currentTask._id,
              reviewerAgentId: reviewer._id,
              requesterAgentId: chief._id,
              requesterAgentName: chief.name,
              note: `Chief auto-submitted '${currentTask.title}' for review after detecting evidence-ready progress in task comments/docs.`,
            });
            await m((api).messages.create, {
              taskId: currentTask._id,
              fromAgentId: chief._id,
              fromName: chief.name,
              content:
                `Chief monitor: Evidence is present${pathRequiredTask ? " (including output path)" : ""}. ` +
                `Auto-submitting to ${reviewer.name} for review to prevent Active-state stall.`,
            });
            continue;
          }

          const followupsSent = Number(currentTask.escalationLevel ?? 0);
          const aboutToExceedFollowupLimit =
            followupsSent >= Math.max(0, config.maxChiefFollowupsBeforeBlocking - 1);
          const missingEvidence = !evidence.hasAssigneeEvidence;
          const missingStructuredEvidence = config.structuredWorklogRequired
            ? evidence.hasAssigneeEvidence && !evidence.hasStructuredAssigneeEvidence
            : false;
          const missingOutputPath = pathRequiredTask && !hasOutputPathEvidence;

          if (
            config.autoBlockStaleExecutionEnabled &&
            aboutToExceedFollowupLimit &&
            (missingEvidence || missingStructuredEvidence || missingOutputPath)
          ) {
            const steps = await listAccountabilitySteps(currentTask._id);
            const currentRunning = findRunningStep(steps);
            const blockReason = missingStructuredEvidence
              ? `Structured worklog evidence missing after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s).`
              : missingEvidence
              ? `No assignee evidence/comments/docs after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s).`
              : `Implementation task still missing canonical Artifact Folder evidence after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s).`;
            const pathIssue = missingOutputPath
              ? deriveOutputPathEvidenceFailure(
                  evidence,
                  `implementation task still missing canonical Artifact Folder evidence after ${config.maxChiefFollowupsBeforeBlocking} chief follow-up cycle(s)`
                )
              : null;
            await blockTaskWithStep({
              task: currentTask,
              chief,
              stepIndex: currentRunning ? Number(currentRunning.stepIndex) : 0,
              reason: missingStructuredEvidence
                ? "invalid_worklog_schema: followup limit reached"
                : missingEvidence
                  ? "no_assignee_progress: followup limit reached"
                  : pathIssue?.reason || "artifact_folder_empty: followup limit reached",
              nextAction: missingEvidence || missingStructuredEvidence
                ? "Blocked: assignee must post concrete implementation evidence before retry"
                : pathIssue?.code === "artifact_path_not_found"
                  ? "Blocked: canonical artifact folder path is missing; assignee must regenerate outputs there"
                    : pathIssue?.code === "artifact_folder_empty"
                      ? "Blocked: canonical artifact folder has no deliverable files; assignee must write artifacts there"
                      : isInvalidOutputPathIssue(pathIssue?.code || "")
                      ? "Blocked: assignee must correct invalid path references and provide verifiable Artifact Folder evidence before review"
                      : "Blocked: assignee must provide verifiable Artifact Folder evidence before review",
              comment:
                `Chief auto-blocked to prevent indefinite Active-state stall.\n` +
                `Reason: ${blockReason}\n` +
                `Required recovery: post concrete progress evidence` +
                `${pathIssue?.code === "artifact_path_not_found" || pathIssue?.code === "artifact_folder_empty"
                  ? " and populate the canonical auto-managed artifact folder for this task"
                  : pathRequiredTask
                    ? " and verifiable artifact files in the canonical auto-managed folder (Stored Location text is optional)"
                    : ""}, then reopen/retry.`,
              nextCheckInMinutes: Math.max(5, Number(currentTask.staleAfterMinutes ?? config.taskStaleDefaultMinutes)),
            });
            continue;
          }
        }
        const reason =
          currentTask.status === "blocked"
            ? "Task remains blocked past monitoring window"
            : "No recent assignee update; requesting progress update";
        await m((api).automation.markTaskEscalated, {
          taskId: currentTask._id,
          chiefAgentId: chief._id,
          chiefAgentName: chief.name,
          reason,
        });
        await m(api.messages.create, {
          taskId: currentTask._id,
          fromAgentId: chief._id,
          fromName: chief.name,
          content: `Chief follow-up: ${reason}. Please post concrete status, next action, and blockers.`,
        });
        await emitExecutionEvent({
          taskId: currentTask._id,
          actorAgentId: chief._id,
          actorName: chief.name,
          actorRole: "chief",
          kind: "heartbeat",
          severity: "warning",
          title: "Chief follow-up escalation",
          summary: reason,
          workDone: "Chief escalated due to stale/no assignee progress.",
          workingNow: "Waiting for assignee structured update.",
          nextSteps: "Assignee must post concrete status, blockers, and next action.",
          blockers: reason,
          detailsMarkdown:
            `### Chief Follow-up\n` +
            `- Reason: ${reason}\n` +
            `- Required response: assignee progress update with evidence.`,
        });
        await m((api).automation.setTaskNextCheck, {
          taskId: currentTask._id,
          nextCheckAt:
            Date.now() + (currentTask.staleAfterMinutes ?? config.taskStaleDefaultMinutes) * 60 * 1000,
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
  const chief = agents.byName.get(config.chiefAgentName);
  await backfillAccountabilityForTask(task, agents);
  const preReviewSteps = await listAccountabilitySteps(task._id);
  const reviewerStep = preReviewSteps.find((step) => step.role === "reviewer");
  if (reviewerStep) {
    await ensureRunningStepStart(task._id, Number(reviewerStep.stepIndex), reviewer._id);
  }
  const taskMessages = await q(api.messages.listByTask, { taskId: task._id });
  const taskDocs = await q(api.documents.list, { taskId: task._id });
  const runs = await q((api).automation.listAutomationRunsByTask, { taskId: task._id });
  const assigneeIds = (task.assigneeIds ?? []).map(String);
  const assignees = await Promise.all((task.assigneeIds ?? []).map((id) => q(api.agents.get, { id })));
  const assigneeNames = new Set(assignees.map((a) => String(a?.name || "").toLowerCase()).filter(Boolean));
  const assigneeMessages = (taskMessages ?? []).filter((msg) => {
    const fromName = String(msg?.fromName || "").toLowerCase();
    const fromAgentId = String(msg?.fromAgentId || "");
    return assigneeNames.has(fromName) || assigneeIds.includes(fromAgentId);
  });
  const latestReview = await q((api).reviews.latestByTask, { taskId: task._id });
  const reviewBoundaryAt =
    String(task.reviewStatus || "") === "changes_requested" &&
    String(latestReview?.status || "") === "fail"
      ? Number(latestReview?.reviewedAt ?? latestReview?._creationTime ?? 0)
      : 0;

  const structuredAssigneeWorklogs = assigneeMessages.filter((msg) => {
    const fromName = String(msg?.fromName || "").toLowerCase();
    const fromAgentId = String(msg?.fromAgentId || "");
    const isAssignee = assigneeNames.has(fromName) || assigneeIds.includes(fromAgentId);
    if (!isAssignee) return false;
    return isStructuredWorklog(String(msg?.content || ""), { requirePath: false });
  });
  const assigneeMessagesInWindow =
    reviewBoundaryAt > 0
      ? assigneeMessages.filter((msg) => Number(msg?._creationTime ?? 0) > reviewBoundaryAt)
      : assigneeMessages;
  const structuredAssigneeWorklogsInWindow =
    reviewBoundaryAt > 0
      ? structuredAssigneeWorklogs.filter(
          (msg) => Number(msg?._creationTime ?? 0) > reviewBoundaryAt
        )
      : structuredAssigneeWorklogs;
  const assigneeDocsInWindow =
    reviewBoundaryAt > 0
      ? (taskDocs ?? []).filter((doc) => {
          const createdBy = String(doc?.createdBy || "");
          const isAssignee = assigneeIds.includes(createdBy);
          return isAssignee && Number(doc?._creationTime ?? 0) > reviewBoundaryAt;
        })
      : taskDocs ?? [];
  const hasEvidence = config.structuredWorklogRequired
    ? structuredAssigneeWorklogsInWindow.length > 0 || assigneeDocsInWindow.length > 0
    : assigneeMessagesInWindow.length > 0 || assigneeDocsInWindow.length > 0;
  const acceptance = task.acceptanceCriteria ?? [];
  const workflowKind = resolveTaskWorkflowKind(task);
  const pathRequiredTask = taskRequiresOutputPathEvidence(task);
  const evidenceSnapshot = await inspectTaskEvidence(task._id);
  const reportedOutputPaths = [...(evidenceSnapshot.reportedOutputPaths ?? [])];
  const missingOutputPaths = [...(evidenceSnapshot.missingOutputPaths ?? [])];
  const emptyOutputPaths = [...(evidenceSnapshot.emptyOutputPaths ?? [])];
  const outputPaths = [...(evidenceSnapshot.outputPaths ?? [])];
  const hasOutputPathEvidence = outputPaths.length > 0;
  const qualityGate = evaluateImplementationQuality(task, evidenceSnapshot);
  const qualityPass = qualityGate.pass;
  const specialistSucceeded = (runs ?? []).some((r) => {
    if (r.role !== "specialist") return false;
    if (!(r.dispatchType === "execution" || r.dispatchType === "monitor")) return false;
    if (r.status !== "succeeded") return false;
    if (reviewBoundaryAt > 0) {
      const runAt = Number(r.finishedAt ?? r.startedAt ?? r._creationTime ?? 0);
      return runAt > reviewBoundaryAt;
    }
    return true;
  });

  const prompt = buildReviewerPrompt({
    task,
    workflowKind,
    acceptanceCriteria: acceptance,
  });
  const reviewerDispatchStartedAt = Date.now();
  const reviewerRunId = await startAutomationRun({
    taskId: task._id,
    role: "reviewer",
    agentName: reviewer.name,
    agentId: reviewer._id,
    dispatchType: "review",
    attempt: 1,
    inputSummary: "Reviewer validation",
  });
  if (reviewerStep) {
    await attachDispatchRunToStep(task._id, Number(reviewerStep.stepIndex), reviewerRunId);
  }

  const result = await runOpenClawAgent({ role: "reviewer", task, prompt, targetAgent: reviewer });
  const reviewerRunSummary = summarizeOpenClawRunOutput(result);
  const reviewerRunFinalId = await finishAutomationRun({
    taskId: task._id,
    role: "reviewer",
    agentName: reviewer.name,
    agentId: reviewer._id,
    dispatchType: "review",
    attempt: 1,
    inputSummary: "Reviewer validation",
    startedAt: reviewerDispatchStartedAt,
    result,
    successSummary: "Reviewer dispatch invoked",
    failureSummary: "Reviewer dispatch failed",
  });
  if (reviewerStep) {
    await attachDispatchRunToStep(task._id, Number(reviewerStep.stepIndex), reviewerRunFinalId);
  }

  let approved = false;
  let summary = "";
  let findings = [];

  if (config.reviewerDefaultDecision === "pass") {
    const hardGatePass =
      hasEvidence &&
      acceptance.length > 0 &&
      specialistSucceeded &&
      (!pathRequiredTask || hasOutputPathEvidence) &&
      qualityPass;
    approved = hardGatePass;
    summary = hardGatePass
      ? "Reviewer auto-approved (configured pass fallback with hard proof gate)."
      : "Reviewer auto-pass override blocked: mandatory evidence/proof gate not satisfied.";
    if (!hasEvidence) findings.push("Auto-pass blocked: no assignee evidence.");
    if (acceptance.length === 0) findings.push("Auto-pass blocked: acceptance criteria missing.");
    if (!specialistSucceeded) findings.push("Auto-pass blocked: no successful specialist execution run.");
    if (pathRequiredTask && !hasOutputPathEvidence) {
      findings.push("Auto-pass blocked: canonical Artifact Folder evidence is missing or not verifiable on disk.");
    }
    if (!qualityPass) findings.push(...qualityGate.findings);
  } else if (config.reviewerDefaultDecision === "fail") {
    approved = false;
    summary = "Reviewer requested changes (configured fail fallback).";
    findings = ["Manual verification required by reviewer configuration."];
  } else {
    approved =
      hasEvidence &&
      acceptance.length > 0 &&
      specialistSucceeded &&
      (!pathRequiredTask || hasOutputPathEvidence) &&
      qualityPass;
    summary = approved
      ? "Reviewer approved: evidence, acceptance criteria, and execution signals validated."
      : "Reviewer requested changes: insufficient evidence for safe approval.";
    if (!hasEvidence) findings.push("No task comments/documents found as review evidence.");
    if (acceptance.length === 0) findings.push("No acceptance criteria recorded by Chief triage.");
    if (!specialistSucceeded) {
      findings.push("No successful specialist execution run recorded in automation audit.");
    }
    if (pathRequiredTask && !hasOutputPathEvidence) {
      const pathIssue =
        deriveOutputPathEvidenceFailure(
          evidenceSnapshot,
          "review gate requires canonical Artifact Folder evidence"
        ) || {
          code: "artifact_folder_empty",
          reason: "artifact_folder_empty: review gate requires canonical Artifact Folder evidence",
        };
      if (isInvalidOutputPathIssue(pathIssue.code)) {
        const sample = (missingOutputPaths.length > 0 ? missingOutputPaths : emptyOutputPaths).slice(0, 2).join(", ");
        findings.push(
          sample
            ? `Task reported path evidence, but it is not verifiable on disk (${sample}). Use the canonical Artifact Folder with real files (or post a corrected existing absolute path).`
            : "Task reported path evidence, but it is not verifiable on disk. Use the canonical Artifact Folder with real files (or post a corrected existing absolute path)."
        );
      } else {
        const artifactRoot = String(evidenceSnapshot.artifactRootPath || "").trim();
        findings.push(
          artifactRoot
            ? `Task missing verifiable artifacts in canonical Artifact Folder (${artifactRoot}). Populate that folder with real deliverable files before approval.`
            : "Task missing verifiable artifact evidence in canonical Artifact Folder. Populate the auto-managed folder before approval."
        );
      }
    }
    if (!qualityPass) findings.push(...qualityGate.findings);
  }

  const reviewerDecisionSources = [
    reviewerRunSummary.worklogText,
    reviewerRunSummary.lines.join(" | "),
    result?.stdout,
    result?.stderr,
  ];
  const reviewerDecisionSignal = inferReviewerDecisionSignal(...reviewerDecisionSources);
  const nonActionableReviewerReject =
    reviewerDecisionSignal === "reject" &&
    approved &&
    isNonActionableStatusAlignmentReject(...reviewerDecisionSources, findings.join(" | "));
  if (reviewerDecisionSignal === "reject") {
    if (nonActionableReviewerReject) {
      summary =
        "Reviewer noted status-alignment concern, but all verifiable review gates passed. Auto-approving without rework loop.";
      if (!findings.some((item) => /non-actionable status-alignment/i.test(String(item)))) {
        findings.unshift(
          "Non-actionable status-alignment concern ignored because artifact/proof/quality gates already passed."
        );
      }
    } else {
      approved = false;
      summary = "Reviewer requested changes (explicit reviewer verdict overrides auto-approval).";
      if (!findings.some((item) => /explicit reviewer verdict/i.test(String(item)))) {
        findings.unshift("Explicit reviewer verdict indicates FAIL/changes requested.");
      }
    }
  } else if (reviewerDecisionSignal === "approve" && !approved) {
    if (!findings.some((item) => /mandatory review gates/i.test(String(item)))) {
      findings.unshift("Reviewer output indicates approval, but mandatory review gates still failed.");
    }
  }

  const specialistSteps = [...(preReviewSteps || [])]
    .filter((step) => step.role === "specialist")
    .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
  const latestSpecialistStep = specialistSteps[specialistSteps.length - 1] || null;
  const primarySpecialist =
    assignees.find(Boolean) ||
    (latestSpecialistStep?.agentId
      ? agents.byId.get(String(latestSpecialistStep.agentId))
      : null);
  const reviewGateNeedsRepair =
    !approved &&
    (!hasEvidence || (pathRequiredTask && !hasOutputPathEvidence) || !qualityPass);
  const qualityRepairAttempts = primarySpecialist
    ? countQualityAutofixAttempts(runs, primarySpecialist.name)
    : 0;
  if (
    reviewGateNeedsRepair &&
    primarySpecialist &&
    config.specialistQualityAutofixEnabled &&
    qualityRepairAttempts < config.specialistQualityAutofixMaxAttempts
  ) {
    await m(api.tasks.updateStatus, {
      id: task._id,
      status: "in_progress",
      agentId: chief?._id ?? reviewer._id,
      agentName: chief?.name || reviewer.name,
    });
    await m((api).automation.updateTaskAutomationState, {
      taskId: task._id,
      automationState: "executing",
      reviewStatus: "pending",
      nextAction: `Auto quality repair in progress by ${primarySpecialist.name}`,
    });
    await m((api).automation.setTaskNextCheck, {
      taskId: task._id,
      nextCheckAt: Date.now() + 2 * 60 * 1000,
      nextAction: `Waiting for ${primarySpecialist.name} auto quality repair evidence`,
      chiefAgentId: chief?._id,
    });
    if (latestSpecialistStep?.agentId) {
      await ensureRunningStepStart(
        task._id,
        Number(latestSpecialistStep.stepIndex),
        latestSpecialistStep.agentId
      );
    }
    const repairAttempt = await attemptSpecialistQualityAutofix({
      task,
      specialist: primarySpecialist,
      workflowKind,
      issues: findings,
      requiredOutputPath: await ensureAgentWritableOutputPathReady(task),
      stepIndex: Number(latestSpecialistStep?.stepIndex ?? 0),
      totalSteps: Math.max(1, specialistSteps.length || 1),
      nextHandoff: "Reviewer",
      runs,
      dispatchContext: "review_gate",
    });
    if (repairAttempt.success) {
      await m((api).messages.create, {
        taskId: task._id,
        fromAgentId: chief?._id,
        fromName: chief?.name || config.chiefAgentName,
        kind: "system",
        workflowKind,
        content:
          `Chief auto-repair: ${primarySpecialist.name} was re-dispatched from review gate findings. ` +
          `Task moved back to in_progress for corrected evidence before reviewer re-check.`,
      });
      await emitExecutionEvent({
        taskId: task._id,
        actorAgentId: chief?._id,
        actorName: chief?.name || config.chiefAgentName,
        actorRole: "chief",
        kind: "recovery",
        severity: "info",
        title: "Chief initiated review-gate auto-repair",
        summary: `${primarySpecialist.name} re-dispatched with reviewer findings`,
        workDone: "Task moved from review back to execution for autonomous fix cycle.",
        workingNow: `${primarySpecialist.name} applying fixes and regenerating evidence.`,
        nextSteps: "Reviewer will re-run after specialist proof refresh.",
        blockers: findings.slice(0, 3).join(" | "),
      });
      return;
    }
    if (repairAttempt.attempted) {
      findings.push("Automatic quality-repair dispatch failed; reviewer change request remains active.");
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
  await emitExecutionEvent({
    taskId: task._id,
    actorAgentId: reviewer._id,
    actorName: reviewer.name,
    actorRole: "reviewer",
    kind: "review",
    severity: approved ? "success" : "warning",
    title: approved ? "Reviewer approved task" : "Reviewer requested changes",
    summary,
    workDone: approved
      ? "Review criteria validated and approved."
      : "Review completed with change requests.",
    workingNow: approved ? "Awaiting completion closeout." : "Waiting for specialist rework.",
    nextSteps: approved
      ? "Mark task done and publish completion proof."
      : "Chief to hand off findings to specialist and resume execution.",
    blockers: approved ? "" : findings.join(" | "),
    evidencePaths: normalizeEvidencePaths(outputPaths),
    detailsMarkdown:
      `### Review Decision\n` +
      `- Status: ${approved ? "approved" : "changes_requested"}\n` +
      `- Summary: ${summary}\n` +
      (findings.length > 0 ? `- Findings:\n${findings.map((item) => `  - ${item}`).join("\n")}\n` : "") +
      (outputPaths.length > 0 ? `- Evidence Paths:\n${outputPaths.map((item) => `  - ${item}`).join("\n")}` : ""),
    detailsJson: {
      approved: Boolean(approved),
      findingsCount: findings.length,
      workflowKind,
      qualityGatePass: Boolean(qualityPass),
      qualityGateMetrics: qualityGate.metrics || null,
    },
  });

  if (reviewerStep) {
    await recordAccountabilityProof({
      taskId: task._id,
      stepIndex: Number(reviewerStep.stepIndex),
      summary,
      paths: outputPaths,
      proofMessageId: undefined,
      proofDocumentIds: [],
      dispatchRunId: reviewerRunId,
    });
    await completeAccountabilityStep(task._id, Number(reviewerStep.stepIndex), summary);
  }

  if (!approved) {
    await handoffReviewerFeedbackToSpecialist({
      task,
      agents,
      reviewerStep,
      summary,
      findings,
    });
  }
}

async function telegramDigestLoop(signal) {
  markLoopHeartbeat("telegramDigest", { status: "started" });
  while (!signal.aborted) {
    try {
      markLoopHeartbeat("telegramDigest", { status: "loop" });
      if (!config.telegramDigestEnabled) {
        await sleep(config.telegramDigestLoopIntervalMs);
        continue;
      }

      const tasks = await q(api.tasks.list, {});
      const telegramTasks = (tasks || []).filter(
        (task) => task.source === "telegram" && task.sourceRef?.chatId
      );
      if (telegramTasks.length === 0) {
        await sleep(config.telegramDigestLoopIntervalMs);
        continue;
      }

      const byChat = new Map();
      for (const task of telegramTasks) {
        const chatId = String(task.sourceRef.chatId);
        if (!byChat.has(chatId)) byChat.set(chatId, []);
        byChat.get(chatId).push(task);
      }

      for (const [chatId, chatTasks] of byChat.entries()) {
        const digestState = digestStateForChat(chatId);
        const now = Date.now();
        if (now - Number(digestState.lastSentAt || 0) < config.telegramDigestIntervalMs) {
          continue;
        }

        const stepsByTask = new Map();
        for (const task of chatTasks) {
          if (!config.accountabilityLedgerEnabled) {
            stepsByTask.set(String(task._id), []);
            continue;
          }
          try {
            const steps = await listAccountabilitySteps(task._id);
            stepsByTask.set(String(task._id), steps || []);
          } catch (error) {
            console.error("[digest] failed to load accountability steps", task._id, error);
            stepsByTask.set(String(task._id), []);
          }
        }

        const digest = buildTelegramDigestMessage(chatId, chatTasks, stepsByTask);
        const fingerprint = stableFingerprint(digest.message);

        const summary = digestSummaryMarker(digest.grouped, digest.blockedOrStuckCount);
        try {
          const delivery = await sendTelegramText(chatId, limitTelegramMessage(digest.message), undefined, {
            eventType: "status_digest",
            fingerprint: `${chatId}:${fingerprint}:${summary}`,
            dedupeKey: `digest:${chatId}:${fingerprint}`,
          });
          if (!delivery?.queued && !delivery?.skipped) {
            const logTargets = chatTasks.slice(0, 30);
            for (const task of logTargets) {
              await m((api).telegram.logTelegramStatusSent, {
                taskId: task._id,
                target: chatId,
                summary,
              });
            }
          }
          updateDigestStateForChat(chatId, {
            lastSentAt: now,
            lastFingerprint: fingerprint,
            lastSummary: summary,
          });
        } catch (error) {
          console.error("[digest] telegram send failed", error);
          recordRuntimeError("telegramDigest", error);
        }
      }
    } catch (error) {
      console.error("[digest] loop error", error);
      recordRuntimeError("telegramDigest", error);
      markLoopHeartbeat("telegramDigest", { status: "error" });
      markDegraded(`telegram_digest:${String(error?.message || error)}`);
    }
    await sleep(config.telegramDigestLoopIntervalMs);
  }
  markLoopHeartbeat("telegramDigest", { status: "stopped" });
}

async function backfillTaskArtifactRootsOnce() {
  if (!config.autoTaskArtifactsEnabled) return;
  try {
    const tasks = await q(api.tasks.list, {});
    let patched = 0;
    let verified = 0;
    let snapshotted = 0;
    for (const task of tasks || []) {
      if (!task?._id) continue;
      const desiredRoot = defaultTaskArtifactRoot(task);
      if (!desiredRoot) continue;
      fs.mkdirSync(desiredRoot, { recursive: true });
      const currentRoot = String(task.artifactRootPath || "").trim();
      const currentPolicy = String(task.artifactPolicy || "").trim();
      if (
        !artifactPathPersistenceUnsupported &&
        (currentRoot !== desiredRoot || currentPolicy !== "auto_managed")
      ) {
        try {
          await m((api).tasks.setArtifactRootPath, {
            id: task._id,
            artifactRootPath: desiredRoot,
            artifactPolicy: "auto_managed",
          });
          patched += 1;
        } catch (error) {
          const message = String(error?.message || error || "");
          if (/Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(message)) {
            artifactPathPersistenceUnsupported = true;
            console.warn("[artifact-backfill] setArtifactRootPath unavailable on deployment; using local fallback only");
          } else {
            throw error;
          }
        }
      }
      if (!artifactVerificationPersistenceUnsupported && pathHasVerifiableArtifact(desiredRoot)) {
        try {
          await m((api).tasks.touchArtifactVerification, {
            id: task._id,
            artifactRootPath: desiredRoot,
            artifactLastVerifiedAt: Date.now(),
          });
          verified += 1;
        } catch (error) {
          const message = String(error?.message || error || "");
          if (/Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(message)) {
            artifactVerificationPersistenceUnsupported = true;
            console.warn("[artifact-backfill] touchArtifactVerification unavailable on deployment; skipping verification persistence");
          } else {
            throw error;
          }
        }
      }

      if (!pathHasVerifiableArtifact(desiredRoot)) {
        try {
          const [taskMessages, taskDocs] = await Promise.all([
            q(api.messages.listByTask, { taskId: task._id }),
            q(api.documents.list, { taskId: task._id }),
          ]);
          const { assigneeMessages, assigneeDocs } = await collectAssigneeEvidence(
            task,
            taskMessages,
            taskDocs
          );
          const reported = extractAbsolutePathEvidence(assigneeMessages, assigneeDocs);
          const snapshotResult = ensureAssigneeEvidenceSnapshot(
            task,
            assigneeMessages,
            assigneeDocs,
            reported
          );
          if (snapshotResult?.wrote) {
            snapshotted += 1;
          }
        } catch (error) {
          console.warn(
            `[artifact-backfill] snapshot fallback failed for task ${String(task?._id || "")}: ${String(error?.message || error)}`
          );
        }
      }
    }
    if (patched > 0 || verified > 0 || snapshotted > 0) {
      console.log(
        `[artifact-backfill] completed: patched=${patched}, verified=${verified}, snapshotted=${snapshotted}, total=${tasks?.length ?? 0}`
      );
    }
  } catch (error) {
    console.error("[artifact-backfill] failed", error);
    recordRuntimeError("artifactBackfill", error);
  }
}

async function main() {
  const previousRuntimeState = loadRuntimeState();
  const currentOutbox = loadOutbox();
  persistOutbox(currentOutbox);
  persistInvalidChats(invalidChatState);
  console.log("[orchestrator] starting");
  console.log("[orchestrator] convex:", config.convexUrl);
  console.log("[orchestrator] webhook:", config.telegramWebhookEnabled, config.telegramWebhookPort);
  console.log("[orchestrator] polling:", config.telegramPollingEnabled);
  console.log(
    "[orchestrator] telegram digest:",
    config.telegramDigestEnabled
      ? `enabled (interval=${Math.round(config.telegramDigestIntervalMs / 60000)}m, loop=${Math.round(
          config.telegramDigestLoopIntervalMs / 1000
        )}s, include_done=${config.telegramDigestIncludeDone}, done_limit=${config.telegramDigestDoneLimit})`
      : "disabled"
  );
  console.log(
    "[orchestrator] blocked auto-recovery:",
    config.autoRecoverBlockedTasksEnabled
      ? `enabled (cooldown=${Math.round(config.blockedRecoveryCooldownMs / 60000)}m, max_attempts=${config.blockedRecoveryMaxAttempts})`
      : "disabled"
  );
  console.log(
    "[orchestrator] task artifacts:",
    config.autoTaskArtifactsEnabled
      ? `auto-managed (root=${config.taskArtifactsRoot}, mirror_external=${config.taskArtifactMirrorExternal})`
      : "manual"
  );
  console.log(
    "[orchestrator] chief->pm parallel workflow:",
    config.hierarchicalPmWorkflowEnabled
      ? `enabled (default=${config.chiefPmParallelDefault ? "chief_pm_parallel" : "legacy_sequential"}, heartbeat=${config.nodeHeartbeatMinutes}m, retry_budget=${config.chiefNodeRetryBudget})`
      : "disabled"
  );
  reportOpenClawWorkspaceCompatibility();
  const modelLockStatus = getOpenClawModelLockStatus({ force: true });
  const startupPreflight = {
    ok: modelLockStatus.ok,
    checkedAt: Date.now(),
    profile: config.openclawProfile || "(default)",
    home: config.openclawHome,
    configPath: modelLockStatus.configPath,
    provider: modelLockStatus.providerKey || config.openclawProviderLock,
    baseUrl: modelLockStatus.baseUrl || "",
    authProfileKey: modelLockStatus.authProfileKey || `${config.openclawProviderLock}:default`,
    primaryModel: modelLockStatus.primaryModel || "",
    reason: modelLockStatus.reason || "",
  };
  console.log(
    "[orchestrator] openclaw model lock:",
    modelLockStatus.ok
      ? `ok (primary=${modelLockStatus.primaryModel || "unknown"})`
      : `failed (${modelLockStatus.reason || "unknown_reason"})`
  );
  console.log(
    "[orchestrator] openclaw runtime profile:",
    `profile=${startupPreflight.profile} home=${startupPreflight.home} provider=${startupPreflight.provider} baseUrl=${startupPreflight.baseUrl || "(missing)"}`
  );
  console.log(
    "[orchestrator] openclaw config sync:",
    `enabled=${config.openclawConfigSyncEnabled} strict_startup=${config.openclawConfigStrictStartup} canonical_home=${config.openclawConfigCanonicalHome}`
  );
  if (!modelLockStatus.ok) {
    markDegraded(`startup_preflight_failed:${modelLockStatus.reason || "invalid_openclaw_profile"}`);
    console.error(
      "[orchestrator] model lock preflight failed. Specialist dispatch will be blocked until profile/model configuration is fixed."
    );
  } else {
    clearDegradedIfHealthy();
  }
  const shadowActive = isWorkflowShadowModeActive();
  console.log(
    "[orchestrator] workflow shadow mode:",
    config.workflowShadowModeEnabled
      ? `${shadowActive ? "active" : "expired"} (window=${config.workflowShadowModeHours}h, strict_gate=${isStrictAccountabilityGateEnabled() ? "on" : "off"})`
      : "disabled"
  );
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
    workflowShadow: {
      enabled: config.workflowShadowModeEnabled,
      active: shadowActive,
      startedAt: workflowShadowStartMs,
      hours: config.workflowShadowModeHours,
      strictGateEnabled: isStrictAccountabilityGateEnabled(),
    },
    startupPreflight,
    telegram: {
      digestEnabled: config.telegramDigestEnabled,
      digestIntervalMs: config.telegramDigestIntervalMs,
      digestLoopIntervalMs: config.telegramDigestLoopIntervalMs,
      digestIncludeDone: config.telegramDigestIncludeDone,
      digestDoneLimit: config.telegramDigestDoneLimit,
      digestByChat: currentDigestMap(),
    },
    outboxSize: (currentOutbox.items || []).length,
    blockedRecovery: blockedRecoveryMap(),
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

  await backfillTaskArtifactRootsOnce();

  startWebhookServer(abort.signal);

  const loops = [
    chiefTriageLoop(abort.signal),
    pmSchedulerLoop(abort.signal),
    chiefWatchdogLoop(abort.signal),
    telegramDigestLoop(abort.signal),
    outboxReplayLoop(abort.signal),
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
