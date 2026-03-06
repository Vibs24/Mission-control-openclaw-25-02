import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { getAgentRolePlaybook, workflowChecklistForAgent } from "./workflows/role-mapping.mjs";
import { CANONICAL_ROLE_ROSTER } from "./workflows/role-roster.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");

const ROLE_KEYWORDS = {
  chief: ["chief", "triage", "assign", "delegate", "priority", "escalat", "orchestr", "monitor"],
  project_manager: ["project manager", "coordina", "dependency", "plan", "handoff", "schedule"],
  frontend: ["frontend", "ui", "ux", "react", "html", "css", "layout", "component", "responsive"],
  designer: ["designer", "design", "visual", "typography", "theme", "wireframe", "mockup"],
  database: ["database", "db", "schema", "sql", "sqlite", "migration", "query", "index"],
  backend: ["backend", "api", "service", "server", "python", "flask", "node", "endpoint", "logic"],
  documentation: ["doc", "documentation", "runbook", "guide", "readme", "changelog", "manual"],
  operations: ["ops", "operation", "stability", "rollback", "deploy", "incident", "recovery", "sla"],
  reviewer: ["review", "verify", "qa", "acceptance", "test", "approve", "validation"],
};

const AGENTS = CANONICAL_ROLE_ROSTER.map((entry) => ({
  roleKey: entry.roleKey,
  name: entry.name,
  slug: entry.roleKey.replace(/_/g, "-"),
  role: entry.role,
  sessionKey: entry.sessionKey,
  keywords: ROLE_KEYWORDS[entry.roleKey] || [entry.name.toLowerCase()],
}));

const AGENT_BY_NAME = new Map(AGENTS.map((a) => [a.name.toLowerCase(), a]));
const AGENT_BY_SLUG = new Map(AGENTS.map((a) => [a.slug, a]));

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

function parseMode(argv) {
  const idx = argv.indexOf("--mode");
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).toLowerCase();
  return "manual";
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveOpenClawHome(profile, explicitHome = "") {
  const fromEnv = String(explicitHome || "").trim();
  if (fromEnv) return fromEnv;
  const normalizedProfile = String(profile || "").trim();
  if (!normalizedProfile || normalizedProfile === "default") {
    return path.join(os.homedir(), ".openclaw");
  }
  return path.join(os.homedir(), `.openclaw-${normalizedProfile}`);
}

const env = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(__dirname, ".env")),
  ...process.env,
};

const config = {
  mode: parseMode(process.argv.slice(2)),
  convexUrl: env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL || "",
  convexAdminToken: env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN || "",
  enabled: env.AGENT_SYNC_ENABLED !== "false",
  syncDir: env.AGENT_SYNC_DIR || path.join(projectRoot, "agents"),
  dailyHour: Math.max(0, Math.min(23, safeNumber(env.AGENT_SYNC_DAILY_HOUR, 0))),
  dailyMinute: Math.max(0, Math.min(59, safeNumber(env.AGENT_SYNC_DAILY_MINUTE, 10))),
  lookbackDays: Math.max(1, safeNumber(env.AGENT_SYNC_LOOKBACK_DAYS, 1)),
  manualFile:
    env.AGENT_SYNC_MANUAL_FILE ||
    path.join(projectRoot, "agents", "_shared", "LATEST_INSTRUCTIONS.md"),
  rulesFile:
    env.AGENT_SYNC_RULES_FILE || path.join(projectRoot, "agents", "_shared", "SYNC_RULES.md"),
  lastSyncFile:
    env.AGENT_SYNC_LAST_SYNC_FILE || path.join(projectRoot, "agents", "_shared", "LAST_SYNC.md"),
  runtimeConfigFile:
    env.AGENT_SYNC_RUNTIME_CONFIG_FILE ||
    path.join(projectRoot, "agents", "_shared", "RUNTIME_CONFIG.md"),
  snapshotFile:
    env.AGENT_SYNC_SNAPSHOT_FILE ||
    path.join(projectRoot, "agents", "_shared", "last_snapshot.json"),
  playbooksDir:
    env.AGENT_SYNC_PLAYBOOKS_DIR ||
    path.join(projectRoot, "agents", "_shared", "playbooks"),
  logFile:
    env.AGENT_SYNC_LOG_FILE ||
    path.join(projectRoot, "orchestrator", "logs", "agent-sync.log"),
  lockFile:
    env.AGENT_SYNC_LOCK_FILE ||
    path.join(projectRoot, "orchestrator", ".state", "agent-sync.lock"),
  staleLockReclaim: env.AGENT_SYNC_STALE_LOCK_RECLAIM !== "false",
  lockStaleMinutes: Math.max(1, safeNumber(env.AGENT_SYNC_LOCK_STALE_MINUTES, 20)),
  openclawProfile: env.OPENCLAW_PROFILE || "mc2",
  openclawHome: resolveOpenClawHome(env.OPENCLAW_PROFILE || "mc2", env.OPENCLAW_HOME || ""),
  openclawProviderKey: env.OPENCLAW_PROVIDER_LOCK || "openai-codex",
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWrite(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
}

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hashFingerprint(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function maskFingerprint(value) {
  return `***${hashFingerprint(value).slice(-8)}`;
}

function logEvent(level, message, metadata = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };
  ensureDir(path.dirname(config.logFile));
  fs.appendFileSync(config.logFile, `${JSON.stringify(entry)}\n`);
}

function parseLockPayload(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pid = Number(lines[0]);
  const startedAt = lines[1] ? Date.parse(lines[1]) : NaN;
  if (Number.isFinite(pid)) {
    return {
      pid,
      startedAt: Number.isFinite(startedAt) ? startedAt : null,
      hostname: null,
    };
  }
  return null;
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function shouldReclaimLock(lockInfo) {
  if (!config.staleLockReclaim) return false;
  const staleMs = config.lockStaleMinutes * 60 * 1000;
  const startedAt = Number(lockInfo?.startedAt || 0);
  const ageMs = startedAt > 0 ? Date.now() - startedAt : Number.POSITIVE_INFINITY;
  const deadPid = !isPidAlive(Number(lockInfo?.pid || 0));
  return deadPid || ageMs >= staleMs;
}

function writeLockPayload(fd) {
  const payload = {
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: Date.now(),
  };
  fs.writeFileSync(fd, `${JSON.stringify(payload)}\n`);
}

function acquireLock() {
  ensureDir(path.dirname(config.lockFile));
  const attempt = (allowReclaim) => {
    try {
      const fd = fs.openSync(config.lockFile, "wx");
      writeLockPayload(fd);
      return fd;
    } catch (error) {
      const code = error?.code || "";
      if (code !== "EEXIST") {
        const msg = `agent-sync lock acquisition failed at ${config.lockFile}`;
        throw new Error(msg, { cause: error });
      }
      if (!allowReclaim) {
        const msg = `agent-sync lock already held at ${config.lockFile}`;
        throw new Error(msg, { cause: error });
      }
      const existingRaw = readText(config.lockFile, "");
      const lockInfo = parseLockPayload(existingRaw);
      if (!shouldReclaimLock(lockInfo)) {
        const msg = `agent-sync lock already held at ${config.lockFile}`;
        throw new Error(msg, { cause: error });
      }
      try {
        fs.unlinkSync(config.lockFile);
        logEvent("warn", "Reclaimed stale agent-sync lock", {
          lockFile: config.lockFile,
          previousPid: lockInfo?.pid ?? null,
          previousStartedAt: lockInfo?.startedAt ?? null,
        });
      } catch (unlinkError) {
        const msg = `agent-sync stale lock reclaim failed at ${config.lockFile}`;
        throw new Error(msg, { cause: unlinkError });
      }
      return attempt(false);
    }
  };
  try {
    return attempt(true);
  } catch (error) {
    throw error;
  }
}

function releaseLock(fd) {
  try {
    fs.closeSync(fd);
  } catch {}
  try {
    fs.unlinkSync(config.lockFile);
  } catch {}
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertManagedSection(existingText, sectionName, bodyText) {
  const begin = `<!-- BEGIN MC_SYNC:${sectionName} -->`;
  const end = `<!-- END MC_SYNC:${sectionName} -->`;
  const section = `${begin}\n${bodyText.trimEnd()}\n${end}\n`;
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "m");

  if (pattern.test(existingText)) {
    return existingText.replace(pattern, section);
  }
  const trimmed = existingText.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${section}`;
}

function writeManagedFile(filePath, sectionName, bodyText, initialPrefix = "") {
  const existing = fs.existsSync(filePath) ? readText(filePath, "") : initialPrefix;
  const next = upsertManagedSection(existing || "", sectionName, bodyText);
  if (next !== existing) {
    atomicWrite(filePath, next);
    return true;
  }
  return false;
}

function uniqueLines(values, max = 15) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const line = String(value || "").trim();
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeName(name = "") {
  return String(name || "").trim().toLowerCase();
}

function mapWorkingHeading(line) {
  const h = String(line || "").trim().toLowerCase();
  if (h === "### active tasks") return "activeTasks";
  if (h === "### immediate directives") return "instructions";
  if (h === "### chief directives") return "chiefDirectives";
  if (h === "### user instructions") return "userInstructions";
  if (h === "### evidence paths") return "evidencePaths";
  return null;
}

function parseWorkingStateFromText(text) {
  const out = {
    activeTasks: [],
    instructions: [],
    chiefDirectives: [],
    userInstructions: [],
    evidencePaths: [],
  };
  let bucket = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const heading = mapWorkingHeading(rawLine);
    if (heading) {
      bucket = heading;
      continue;
    }
    const line = rawLine.trim();
    if (!bucket || !line.startsWith("- ")) continue;
    const value = line.slice(2).trim();
    if (!value || /^no\s+/i.test(value)) continue;
    out[bucket].push(value);
  }
  return out;
}

function readManagedSection(text, sectionName) {
  const begin = `<!-- BEGIN MC_SYNC:${sectionName} -->`;
  const end = `<!-- END MC_SYNC:${sectionName} -->`;
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < 0 || stop <= start) return "";
  return text.slice(start + begin.length, stop).trim();
}

function loadExistingWorkingState() {
  const out = {};
  for (const agent of AGENTS) {
    const filePath = path.join(config.syncDir, agent.slug, "memory", "WORKING.md");
    const raw = readText(filePath, "");
    if (!raw.trim()) continue;
    const managed = readManagedSection(raw, "working_state");
    out[agent.slug] = parseWorkingStateFromText(managed || raw);
  }
  return out;
}

function mergeLowerPriorityState(target, fallback, note) {
  if (!fallback) return;
  for (const key of [
    "activeTasks",
    "instructions",
    "chiefDirectives",
    "userInstructions",
    "evidencePaths",
  ]) {
    if ((target[key] || []).length === 0 && (fallback[key] || []).length > 0) {
      target[key].push(...fallback[key]);
      if (note) target.notes.push(note);
    }
  }
}

function roleTargetsFromText(text, fallbackTargets = []) {
  const lowered = String(text || "").toLowerCase();
  const out = new Set();
  for (const agent of AGENTS) {
    if (agent.keywords.some((kw) => lowered.includes(kw))) {
      out.add(agent.slug);
    }
  }
  for (const slug of fallbackTargets) out.add(slug);
  if (out.size === 0) out.add("chief");
  return [...out];
}

function formatTs(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toISOString();
}

function nowDateParts() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return { now, date };
}

function readWorkspaceTemplate(filePath, fallback = "") {
  return readText(filePath, fallback);
}

function defaultSoul(agent) {
  return `# SOUL.md — ${agent.name}\n\n` +
    `Name: ${agent.name}\n` +
    `Role: ${agent.role}\n` +
    `Session Key: ${agent.sessionKey}\n`;
}

function parseManualOverride(rawText) {
  function cleanInstructionText(value) {
    const scaffoldPatterns = [
      /^#\s*LATEST_INSTRUCTIONS\.md\s*$/i,
      /^Add your newest instructions here\.?\s*$/i,
      /^Global instructions apply to all agents\.?\s*$/i,
      /^Optional per-agent sections:?\s*$/i,
    ];
    const kept = String(value || "")
      .split(/\r?\n/)
      .filter((line) => !scaffoldPatterns.some((pattern) => pattern.test(line.trim())));
    return kept.join("\n").trim();
  }

  const text = String(rawText || "").trim();
  if (!text) return { global: "", byAgent: {} };

  const lines = text.split(/\r?\n/);
  const byAgent = {};
  const globalLines = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(/^##\s*agent:\s*([a-z0-9_-]+)/i);
    if (m) {
      const slug = m[1].toLowerCase();
      current = AGENT_BY_SLUG.has(slug) ? slug : null;
      if (current && !byAgent[current]) byAgent[current] = [];
      continue;
    }
    if (current) byAgent[current].push(line);
    else globalLines.push(line);
  }

  const compact = {};
  for (const [slug, value] of Object.entries(byAgent)) {
    const cleaned = cleanInstructionText(value.join("\n"));
    if (cleaned) compact[slug] = cleaned;
  }
  return { global: cleanInstructionText(globalLines.join("\n")), byAgent: compact };
}

async function loadLiveContext() {
  if (!config.convexUrl) throw new Error("Missing Convex URL for live sync context");
  const client = new ConvexHttpClient(config.convexUrl);
  if (config.convexAdminToken) client.setAuth(config.convexAdminToken);

  const [agents, tasks, activities] = await Promise.all([
    client.query(api.agents.list, {}),
    client.query(api.tasks.list, {}),
    client.query(api.activities.list, { limit: 500 }),
  ]);

  const cutoff = Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000;
  const relevantTasks = (tasks || [])
    .filter((task) => {
      const touchedAt = Math.max(
        Number(task._creationTime || 0),
        Number(task.lastChiefCheckAt || 0),
        Number(task.lastAssigneeUpdateAt || 0)
      );
      return task.source === "telegram" || task.status !== "done" || touchedAt >= cutoff;
    })
    .slice(0, 120);

  const messagesByTask = {};
  for (const task of relevantTasks) {
    messagesByTask[String(task._id)] = await client.query(api.messages.listByTask, {
      taskId: task._id,
    });
  }

  return {
    source: "live",
    generatedAt: Date.now(),
    agents,
    tasks: relevantTasks,
    activities: activities || [],
    messagesByTask,
  };
}

function emptyAgentState(agent) {
  return {
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    sessionKey: agent.sessionKey,
    instructions: [],
    userInstructions: [],
    chiefDirectives: [],
    activeTasks: [],
    reviewTasks: [],
    evidencePaths: [],
    notes: [],
  };
}

function buildAgentContext(rawContext, manualOverride, priorSnapshot, existingWorkingState) {
  const state = Object.fromEntries(AGENTS.map((a) => [a.slug, emptyAgentState(a)]));
  const agentIdToSlug = new Map();

  for (const agent of rawContext.agents || []) {
    const known = AGENT_BY_NAME.get(normalizeName(agent.name));
    if (known) agentIdToSlug.set(String(agent._id), known.slug);
  }

  for (const task of rawContext.tasks || []) {
    const taskId = String(task._id);
    const messages = rawContext.messagesByTask?.[taskId] || [];
    const assigneeSlugs = (task.assigneeIds || [])
      .map((id) => agentIdToSlug.get(String(id)))
      .filter(Boolean);
    const taskLine =
      `[${task.status}/${task.reviewStatus || "pending"}] ${task.title}` +
      (task.nextAction ? ` -> ${task.nextAction}` : "");

    for (const slug of assigneeSlugs) {
      state[slug].activeTasks.push(taskLine);
    }
    if (task.status === "review") {
      state.reviewer.reviewTasks.push(taskLine);
    }
    if (task.status !== "done") {
      state.chief.activeTasks.push(taskLine);
    }

    const taskText = `${task.title}\n${task.description}\n${task.intakeText || ""}\n${task.nextAction || ""}`;
    const fallbackTargets = assigneeSlugs.length ? assigneeSlugs : ["chief"];
    for (const slug of roleTargetsFromText(taskText, fallbackTargets)) {
      state[slug].instructions.push(`Task context: ${taskLine}`);
    }

    const requester = normalizeName(task.requesterName || "");
    for (const msg of messages) {
      const fromName = normalizeName(msg.fromName || "");
      const content = String(msg.content || "").trim();
      if (!content) continue;

      if (fromName.includes("jarvis") || fromName.includes("chief") || content.toLowerCase().includes("chief ")) {
        for (const slug of roleTargetsFromText(content, fallbackTargets)) {
          state[slug].chiefDirectives.push(content);
        }
      }

      const userLike =
        /sypha|fomo|vaibhav/.test(fromName) ||
        (requester && requester === fromName) ||
        fromName.includes("requester");
      if (userLike) {
        for (const slug of roleTargetsFromText(content, fallbackTargets)) {
          state[slug].userInstructions.push(content);
        }
      }

      const pathMatches = [...content.matchAll(/(?:output path|stored location(?:\s+\d+)?)\s*:\s*(\/\S+)/gi)];
      for (const match of pathMatches) {
        const pathValue = String(match[1] || "").replace(/[`'",.;:!?]+$/g, "");
        for (const slug of fallbackTargets) {
          state[slug].evidencePaths.push(pathValue);
        }
      }
    }
  }

  for (const activity of rawContext.activities || []) {
    const activityText = `${activity.message || ""} ${JSON.stringify(activity.metadata || {})}`;
    const fallbackTargets = [];
    const agentSlug = AGENT_BY_NAME.get(normalizeName(activity.agentName || ""))?.slug;
    if (agentSlug) fallbackTargets.push(agentSlug);
    if (activity.taskId) fallbackTargets.push("chief");
    for (const slug of roleTargetsFromText(activityText, fallbackTargets)) {
      state[slug].instructions.push(`Activity: ${String(activity.message || "").trim()}`);
    }
  }

  for (const agent of AGENTS) {
    const current = state[agent.slug];
    const existing = existingWorkingState?.[agent.slug];
    mergeLowerPriorityState(
      current,
      existing,
      "Using existing WORKING.md state due no new higher-priority deltas."
    );
  }

  // Fallback to prior snapshot if live context is sparse/unavailable.
  if (priorSnapshot?.perAgent) {
    for (const agent of AGENTS) {
      const current = state[agent.slug];
      const prev = priorSnapshot.perAgent[agent.slug];
      mergeLowerPriorityState(
        current,
        prev,
        "Using previous snapshot state due degraded/live data gap."
      );
    }
  }

  if (manualOverride.global) {
    for (const agent of AGENTS) {
      state[agent.slug].instructions = [
        `Manual override (global): ${manualOverride.global}`,
        ...state[agent.slug].instructions,
      ];
    }
  }
  for (const [slug, text] of Object.entries(manualOverride.byAgent || {})) {
    if (!state[slug]) continue;
    state[slug].instructions = [`Manual override (agent): ${text}`, ...state[slug].instructions];
  }

  for (const agent of AGENTS) {
    const s = state[agent.slug];
    s.instructions = uniqueLines(s.instructions, 25);
    s.userInstructions = uniqueLines(s.userInstructions, 20);
    s.chiefDirectives = uniqueLines(s.chiefDirectives, 20);
    s.activeTasks = uniqueLines(s.activeTasks, 20);
    s.reviewTasks = uniqueLines(s.reviewTasks, 10);
    s.evidencePaths = uniqueLines(s.evidencePaths, 10);
    s.notes = uniqueLines(s.notes, 10);
  }

  return state;
}

function bulletBlock(values, emptyLine) {
  const lines = uniqueLines(values || [], 30);
  if (lines.length === 0) return `- ${emptyLine}`;
  return lines.map((line) => `- ${line}`).join("\n");
}

function deriveSecretFingerprint(authProfile = {}) {
  const secretCandidates = [
    authProfile?.apiKey,
    authProfile?.token,
    authProfile?.accessToken,
    authProfile?.key,
    env.OPENAI_API_KEY,
    env.OPENAI_API_TOKEN,
    env.OPENAI_CODEX_API_KEY,
  ];
  const value = secretCandidates.find((entry) => String(entry || "").trim().length > 0);
  if (!value) return "unavailable";
  return maskFingerprint(String(value));
}

function loadRuntimeConfigSnapshot() {
  const providerKey = String(config.openclawProviderKey || "openai-codex").trim();
  const authProfileKey = `${providerKey}:default`;
  const configPath = path.join(config.openclawHome, "openclaw.json");
  const profileJson = readJson(configPath, null);
  const providerConfig = profileJson?.models?.providers?.[providerKey] || null;
  const authProfile = profileJson?.auth?.profiles?.[authProfileKey] || null;
  const primaryModel = String(profileJson?.agents?.defaults?.model?.primary || "").trim();
  const baseUrl = String(providerConfig?.baseUrl || "").trim();
  const authMode = String(authProfile?.mode || "").trim();
  const authProvider = String(authProfile?.provider || "").trim();

  return {
    profile: config.openclawProfile,
    home: config.openclawHome,
    configPath,
    providerKey,
    authProfileKey,
    primaryModel: primaryModel || "(missing)",
    baseUrl: baseUrl || "(missing)",
    authMode: authMode || "(missing)",
    authProvider: authProvider || providerKey,
    authSecretFingerprint: deriveSecretFingerprint(authProfile || {}),
    providerFingerprint: maskFingerprint(providerConfig || {}),
    loaded: Boolean(profileJson && typeof profileJson === "object"),
  };
}

function renderRuntimeConfigSection(runtimeSnapshot) {
  const status = runtimeSnapshot.loaded ? "loaded" : "missing_config";
  return [
    "## Runtime Config Snapshot",
    "",
    `- Status: ${status}`,
    `- Profile: ${runtimeSnapshot.profile}`,
    `- Home: ${runtimeSnapshot.home}`,
    `- Config Path: ${runtimeSnapshot.configPath}`,
    `- Provider: ${runtimeSnapshot.providerKey}`,
    `- Model: ${runtimeSnapshot.primaryModel}`,
    `- Base URL: ${runtimeSnapshot.baseUrl}`,
    `- Auth Profile: ${runtimeSnapshot.authProfileKey}`,
    `- Auth Mode: ${runtimeSnapshot.authMode}`,
    `- Auth Provider: ${runtimeSnapshot.authProvider}`,
    `- Provider Fingerprint: ${runtimeSnapshot.providerFingerprint}`,
    `- Auth Secret Fingerprint: ${runtimeSnapshot.authSecretFingerprint}`,
    "",
  ].join("\n");
}

function writeRuntimeConfigShared(runtimeSnapshot) {
  const lines = [
    "# RUNTIME_CONFIG.md",
    "",
    `- Generated At: ${new Date().toISOString()}`,
    `- Sync Mode: ${config.mode}`,
    "",
    ...renderRuntimeConfigSection(runtimeSnapshot).split(/\r?\n/),
  ];
  atomicWrite(config.runtimeConfigFile, `${lines.join("\n").trimEnd()}\n`);
}

function ensureSharedFiles() {
  ensureDir(config.syncDir);
  const sharedDir = path.join(config.syncDir, "_shared");
  ensureDir(sharedDir);
  ensureDir(config.playbooksDir);

  if (!fs.existsSync(config.manualFile)) {
    atomicWrite(
      config.manualFile,
      [
        "# LATEST_INSTRUCTIONS.md",
        "",
        "Add your newest instructions here.",
        "",
        "Global instructions apply to all agents.",
        "Optional per-agent sections:",
        "## agent:chief",
        "## agent:project-manager",
        "## agent:frontend",
        "## agent:designer",
        "## agent:database",
        "## agent:backend",
        "## agent:documentation",
        "## agent:operations",
        "## agent:reviewer",
        "",
      ].join("\n")
    );
  }

  if (!fs.existsSync(config.rulesFile)) {
    atomicWrite(
      config.rulesFile,
      [
        "# SYNC_RULES.md",
        "",
        "- This file is managed by Mission Control agent-sync.",
        "- Merge precedence: manual override > inferred user/task instructions > existing WORKING.md > workspace templates.",
        "- Managed sections are between `BEGIN MC_SYNC` / `END MC_SYNC` markers.",
        "- Free text outside markers is preserved.",
        "- Daily sync runs at 00:10 local + startup sync.",
        "",
      ].join("\n")
    );
  }

  if (!fs.existsSync(config.lastSyncFile)) {
    atomicWrite(
      config.lastSyncFile,
      `# LAST_SYNC.md\n\nNo sync has completed yet.\n`
    );
  }

  if (!fs.existsSync(config.runtimeConfigFile)) {
    atomicWrite(
      config.runtimeConfigFile,
      "# RUNTIME_CONFIG.md\n\nNo runtime config snapshot captured yet.\n"
    );
  }

  const defaultPlaybooks = {
    general: [
      "# General Workflow",
      "",
      "- Post structured worklog updates for every execution turn.",
      "- Keep evidence explicit and verifiable.",
      "- Record blockers and next handoff owner.",
      "",
    ].join("\n"),
    review: [
      "# Review Workflow",
      "",
      "- Cover security, performance, correctness, and maintainability.",
      "- Include file/line evidence where possible.",
      "- End with clear verdict: approve or changes requested.",
      "",
    ].join("\n"),
    debug: [
      "# Debug Workflow",
      "",
      "- Use reproduce -> isolate -> diagnose -> fix flow.",
      "- Capture root cause and prevention steps.",
      "- Provide precise reproduction details.",
      "",
    ].join("\n"),
    incident: [
      "# Incident Workflow",
      "",
      "- Capture severity, impact, and timeline.",
      "- Prioritize mitigation before deep root-cause dive.",
      "- Maintain update cadence and final postmortem actions.",
      "",
    ].join("\n"),
    architecture: [
      "# Architecture Workflow",
      "",
      "- Capture context and constraints.",
      "- Compare options and tradeoffs.",
      "- End with decision and implementation consequences.",
      "",
    ].join("\n"),
    standup: [
      "# Standup Workflow",
      "",
      "- Summarize yesterday, today, blockers.",
      "- Keep concise and action-oriented.",
      "",
    ].join("\n"),
    deploy_checklist: [
      "# Deploy Checklist Workflow",
      "",
      "- Verify pre-deploy checks and rollback criteria.",
      "- Record deploy-time validations and post-deploy monitors.",
      "",
    ].join("\n"),
  };
  for (const [name, content] of Object.entries(defaultPlaybooks)) {
    const filePath = path.join(config.playbooksDir, `${name}.md`);
    if (!fs.existsSync(filePath)) atomicWrite(filePath, content);
    if (name === "deploy_checklist") {
      const aliasPath = path.join(config.playbooksDir, "deploy-checklist.md");
      if (!fs.existsSync(aliasPath)) atomicWrite(aliasPath, content);
    }
  }
}

function renderSection(name, mode, status, body, syncDate) {
  return [
    `# ${name}`,
    "",
    `- Mode: ${mode}`,
    `- Status: ${status}`,
    `- Sync Date: ${syncDate}`,
    "",
    body.trim(),
    "",
  ].join("\n");
}

function renderWorking(agentState) {
  return [
    "## Current Working State",
    "",
    "### Active Tasks",
    bulletBlock(agentState.activeTasks, "No active tasks currently assigned."),
    "",
    "### Immediate Directives",
    bulletBlock(agentState.instructions, "No new directives captured in current window."),
    "",
    "### Chief Directives",
    bulletBlock(agentState.chiefDirectives, "No new chief directives."),
    "",
    "### User Instructions",
    bulletBlock(agentState.userInstructions, "No direct user instruction captured."),
    "",
    "### Evidence Paths",
    bulletBlock(agentState.evidencePaths, "No output path evidence yet."),
    "",
  ].join("\n");
}

function renderIdentity(agent) {
  return [
    "## Agent Identity Snapshot",
    "",
    `- Name: ${agent.name}`,
    `- Slug: ${agent.slug}`,
    `- Role: ${agent.role}`,
    `- Session Key: ${agent.sessionKey}`,
    `- Managed Path: ${path.join(config.syncDir, agent.slug)}`,
    "",
  ].join("\n");
}

function renderUser(agentState) {
  return [
    "## Latest User Intent",
    "",
    bulletBlock(agentState.userInstructions, "No new direct user instructions in lookback window."),
    "",
  ].join("\n");
}

function renderMemory(agentState) {
  return [
    "## Curated Operational Memory",
    "",
    "### Durable Instructions",
    bulletBlock(agentState.instructions, "No durable instruction changes detected."),
    "",
    "### Notes",
    bulletBlock(agentState.notes, "No additional notes."),
    "",
  ].join("\n");
}

function renderHeartbeat(agentState) {
  return [
    "## Daily Heartbeat Focus",
    "",
    "### Must-Do Items",
    bulletBlock(agentState.activeTasks, "No active task; monitor Mission Control feed and mentions."),
    "",
    "### Special Focus",
    bulletBlock(agentState.instructions, "No special focus changes."),
    "",
  ].join("\n");
}

function renderAgents(agentState) {
  return [
    "## Agent-Specific Operating Updates",
    "",
    bulletBlock(agentState.instructions, "No agent-specific changes."),
    "",
  ].join("\n");
}

function renderSoul(agentState) {
  return [
    "## Daily Alignment",
    "",
    "### Mission Priorities",
    bulletBlock(agentState.activeTasks, "No active mission priorities."),
    "",
    "### Behavioral Directives",
    bulletBlock(
      [...agentState.chiefDirectives, ...agentState.userInstructions],
      "No new behavior directives."
    ),
    "",
  ].join("\n");
}

function renderPlaybook(agent, agentState, sharedPlaybooks) {
  const profile = getAgentRolePlaybook(agent.name);
  const workflowLines = workflowChecklistForAgent(agent.name);
  const workflowSet = new Set(
    workflowLines
      .map((line) => String(line).split(":")[0].trim())
      .filter(Boolean)
  );
  const selectedShared = [];
  for (const key of workflowSet) {
    const shared = sharedPlaybooks[key];
    if (shared) selectedShared.push(shared);
  }
  if (selectedShared.length === 0 && sharedPlaybooks.general) {
    selectedShared.push(sharedPlaybooks.general);
  }

  return [
    `## Agent Playbook (${agent.name})`,
    "",
    `### Role Intent`,
    `- ${profile.summary}`,
    "",
    "### Core Responsibilities",
    bulletBlock(profile.responsibilities, "No explicit responsibilities configured."),
    "",
    "### Workflow Ownership",
    bulletBlock(workflowLines, "No workflow ownership mapped."),
    "",
    "### Current Focus Deltas",
    bulletBlock(agentState.instructions, "No new workflow deltas in current sync window."),
    "",
    "### Shared Workflow Templates",
    selectedShared.map((block) => block.trim()).join("\n\n---\n\n") || "- No shared templates loaded.",
    "",
  ].join("\n");
}

function resolvedWorkflowFocus(profile) {
  const focus = Array.isArray(profile?.workflowFocus) ? profile.workflowFocus : [];
  if (focus.includes("all")) {
    return ["general", "review", "debug", "incident", "architecture", "standup", "deploy_checklist"];
  }
  return focus.length > 0 ? focus : ["general"];
}

function renderRole(agent) {
  const profile = getAgentRolePlaybook(agent.name);
  return [
    `## Role Definition (${agent.name})`,
    "",
    `- Canonical role: ${agent.role}`,
    `- Session key: ${agent.sessionKey}`,
    `- Mission summary: ${profile.summary}`,
    "",
    "### Responsibility Contract",
    bulletBlock(profile.responsibilities, "No responsibilities mapped."),
    "",
    "### Ownership Mode",
    "- Work is executed in sequential workflow steps with explicit proof gates.",
    "- One active task step per agent globally.",
    "- Chief orchestrates only; specialist proof must come from specialist agents.",
    "",
  ].join("\n");
}

function renderSkills(agent) {
  const profile = getAgentRolePlaybook(agent.name);
  const workflowFocus = resolvedWorkflowFocus(profile);
  const inferredSkillTags = uniqueLines(
    [
      ...workflowFocus.map((w) => `workflow:${w}`),
      ...((agent.keywords || []).slice(0, 16).map((kw) => `keyword:${kw}`)),
      ...profile.responsibilities.map((r) => `capability:${r}`),
    ],
    40
  );
  return [
    `## Skills Matrix (${agent.name})`,
    "",
    "### Workflow Skills",
    bulletBlock(workflowFocus.map((w) => `${w}`), "general"),
    "",
    "### Capability Tags",
    bulletBlock(inferredSkillTags, "No capability tags."),
    "",
  ].join("\n");
}

function renderWorkflow(agent, agentState) {
  const profile = getAgentRolePlaybook(agent.name);
  const lines = workflowChecklistForAgent(agent.name);
  return [
    `## Workflow Ownership (${agent.name})`,
    "",
    "### Execution Chains",
    bulletBlock(lines, "No workflow chain mapping."),
    "",
    "### Active Workflow Deltas",
    bulletBlock(agentState.activeTasks, "No active workflows in current window."),
    "",
    "### Workflow Focus",
    bulletBlock(resolvedWorkflowFocus(profile), "general"),
    "",
  ].join("\n");
}

function renderRules(agent) {
  return [
    `## Operating Rules (${agent.name})`,
    "",
    "### Hard Rules",
    "- Post concrete updates to task comments for each execution turn.",
    "- Include evidence; implementation tasks require Output Path or Stored Location.",
    "- Do not handoff without satisfying required proof.",
    "- Keep one active task step at a time (global agent constraint).",
    "- If blocked, state reason and next recovery action explicitly.",
    "",
    "### Compliance Notes",
    "- Structured worklog schema is mandatory when strict gate is enabled.",
    "- Reviewer approval is required before done status.",
    "",
  ].join("\n");
}

function extractChecklistItems(markdownText) {
  const out = [];
  for (const raw of String(markdownText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    out.push(line.slice(2).trim());
  }
  return uniqueLines(out, 20);
}

function renderChecklists(agent, sharedPlaybooks) {
  const profile = getAgentRolePlaybook(agent.name);
  const workflowFocus = resolvedWorkflowFocus(profile);
  const sections = [];
  for (const kind of workflowFocus) {
    const md = sharedPlaybooks[kind] || "";
    const items = extractChecklistItems(md);
    sections.push(
      [
        `### ${kind}`,
        bulletBlock(items, "No checklist template found."),
        "",
      ].join("\n")
    );
  }
  return [
    `## Checklist Pack (${agent.name})`,
    "",
    "Use these checklists before handoff/review:",
    "",
    sections.join("\n"),
  ].join("\n");
}

function ensureAgentPack(agent, agentState, templates, date, runtimeSnapshot) {
  const agentDir = path.join(config.syncDir, agent.slug);
  const memDir = path.join(agentDir, "memory");
  ensureDir(agentDir);
  ensureDir(memDir);

  const templateSoul =
    readWorkspaceTemplate(path.join(projectRoot, "workspace", "agents", agent.slug, "SOUL.md")) ||
    defaultSoul(agent);

  let updatedCount = 0;
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "SOUL.md"),
      "daily_alignment",
      renderSoul(agentState),
      templateSoul
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "AGENTS.md"),
      "agent_updates",
      renderAgents(agentState),
      templates.agents
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "AGENTS.md"),
      "runtime_config",
      renderRuntimeConfigSection(runtimeSnapshot),
      templates.agents
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "HEARTBEAT.md"),
      "daily_focus",
      renderHeartbeat(agentState),
      templates.heartbeat
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "MEMORY.md"),
      "durable_memory",
      renderMemory(agentState),
      templates.memory
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "MEMORY.md"),
      "runtime_config",
      renderRuntimeConfigSection(runtimeSnapshot),
      templates.memory
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "USER.md"),
      "latest_user_intent",
      renderUser(agentState),
      templates.user
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "IDENTITY.md"),
      "identity_snapshot",
      renderIdentity(agent),
      templates.identity
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "IDENTITY.md"),
      "runtime_config",
      renderRuntimeConfigSection(runtimeSnapshot),
      templates.identity
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "PLAYBOOK.md"),
      "playbook_sync",
      renderPlaybook(agent, agentState, templates.sharedPlaybooks || {}),
      `# PLAYBOOK.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "role.md"),
      "role_sync",
      renderRole(agent),
      `# role.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "skills.md"),
      "skills_sync",
      renderSkills(agent),
      `# skills.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "workflow.md"),
      "workflow_sync",
      renderWorkflow(agent, agentState),
      `# workflow.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "rules.md"),
      "rules_sync",
      renderRules(agent),
      `# rules.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(agentDir, "checklists.md"),
      "checklists_sync",
      renderChecklists(agent, templates.sharedPlaybooks || {}),
      `# checklists.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(memDir, "WORKING.md"),
      "working_state",
      renderWorking(agentState),
      `# WORKING.md — ${agent.name}\n\n`
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(memDir, "YYYY-MM-DD.md"),
      `rolling_${date}`,
      [
        `## ${date}`,
        "",
        bulletBlock(agentState.instructions, "No new instruction deltas for this date."),
        "",
        "### Active Workflow Deltas",
        bulletBlock(agentState.activeTasks, "No active workflow deltas."),
        "",
      ].join("\n"),
      "# YYYY-MM-DD.md — Rolling daily sync log\n\n"
    )
  );
  updatedCount += Number(
    writeManagedFile(
      path.join(memDir, `${date}.md`),
      "daily_sync",
      renderSection(`${agent.name} Daily Log`, config.mode, "ok", renderWorking(agentState), date),
      `# ${date} — ${agent.name}\n\n`
    )
  );

  return { updatedCount };
}

function validatePack(date) {
  const required = [
    "SOUL.md",
    "AGENTS.md",
    "HEARTBEAT.md",
    "MEMORY.md",
    "USER.md",
    "IDENTITY.md",
    "PLAYBOOK.md",
    "role.md",
    "skills.md",
    "workflow.md",
    "rules.md",
    "checklists.md",
    path.join("memory", "WORKING.md"),
    path.join("memory", "YYYY-MM-DD.md"),
    path.join("memory", `${date}.md`),
  ];
  const missing = [];
  for (const agent of AGENTS) {
    const base = path.join(config.syncDir, agent.slug);
    for (const rel of required) {
      const full = path.join(base, rel);
      if (!fs.existsSync(full)) missing.push(full);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Validation failed, missing files:\n${missing.join("\n")}`);
  }
}

function writeLastSyncReport({ status, degraded, usedSnapshot, errors, perAgent, sources }) {
  const lines = [
    "# LAST_SYNC.md",
    "",
    `- Status: ${status}`,
    `- Mode: ${config.mode}`,
    `- Timestamp: ${new Date().toISOString()}`,
    `- Degraded: ${degraded ? "yes" : "no"}`,
    `- Data Source: ${usedSnapshot ? "snapshot/manual" : "live/manual"}`,
    `- Lookback Days: ${config.lookbackDays}`,
    "",
    "## Sources Used",
    "",
    `- Manual file: ${config.manualFile}`,
    `- Rules file: ${config.rulesFile}`,
    `- Runtime config file: ${config.runtimeConfigFile}`,
    `- Shared playbooks dir: ${config.playbooksDir}`,
    `- Snapshot file: ${config.snapshotFile}`,
    `- Workspace templates: ${path.join(projectRoot, "workspace")}`,
    `- Convex URL: ${config.convexUrl || "(unset)"}`,
    `- Convex calls: tasks.list, messages.listByTask, activities.list, agents.list`,
    `- Context counts: tasks=${sources.taskCount}, activities=${sources.activityCount}, messages=${sources.messageCount}`,
    "",
    "## Agent Update Summary",
    "",
  ];
  for (const agent of AGENTS) {
    const item = perAgent[agent.slug] || { updatedCount: 0 };
    lines.push(`- ${agent.name} (${agent.slug}): updated sections ${item.updatedCount}`);
  }
  if ((sources.deltaCount || 0) === 0) {
    lines.push("", "## Delta Summary", "", "- No new deltas detected in this sync window.");
  }
  if (errors.length > 0) {
    lines.push("", "## Errors / Warnings", "");
    for (const error of errors) lines.push(`- ${error}`);
  }
  lines.push("");
  atomicWrite(config.lastSyncFile, lines.join("\n"));
}

function loadTemplates() {
  const sharedPlaybooks = {};
  for (const name of [
    "general",
    "review",
    "debug",
    "incident",
    "architecture",
    "standup",
    "deploy_checklist",
  ]) {
    const primary = path.join(config.playbooksDir, `${name}.md`);
    const alias = name === "deploy_checklist"
      ? path.join(config.playbooksDir, "deploy-checklist.md")
      : primary;
    sharedPlaybooks[name] = readWorkspaceTemplate(primary, "") || readWorkspaceTemplate(alias, "");
  }
  return {
    agents: readWorkspaceTemplate(path.join(projectRoot, "workspace", "AGENTS.md"), "# AGENTS.md\n\n"),
    heartbeat: readWorkspaceTemplate(path.join(projectRoot, "workspace", "HEARTBEAT.md"), "# HEARTBEAT.md\n\n"),
    memory: readWorkspaceTemplate(path.join(projectRoot, "workspace", "MEMORY.md"), "# MEMORY.md\n\n"),
    user: readWorkspaceTemplate(path.join(projectRoot, "workspace", "USER.md"), "# USER.md\n\n"),
    identity: readWorkspaceTemplate(path.join(projectRoot, "workspace", "IDENTITY.md"), "# IDENTITY.md\n\n"),
    sharedPlaybooks,
  };
}

async function main() {
  if (!config.enabled) {
    console.log("[agent-sync] AGENT_SYNC_ENABLED=false, skipping.");
    return;
  }

  ensureSharedFiles();
  const lockFd = acquireLock();
  let lockReleased = false;
  const releaseLockOnce = () => {
    if (lockReleased) return;
    lockReleased = true;
    releaseLock(lockFd);
  };
  const onTerminate = () => {
    releaseLockOnce();
    process.exit(0);
  };
  process.on("SIGINT", onTerminate);
  process.on("SIGTERM", onTerminate);
  const errors = [];
  let degraded = false;
  let usedSnapshot = false;

  try {
    const { date } = nowDateParts();
    const templates = loadTemplates();
    const runtimeSnapshot = loadRuntimeConfigSnapshot();
    const manualOverride = parseManualOverride(readText(config.manualFile, ""));
    const existingWorkingState = loadExistingWorkingState();
    const sourceSummary = { taskCount: 0, activityCount: 0, messageCount: 0, deltaCount: 0 };

    let liveContext = null;
    let snapshot = readJson(config.snapshotFile, null);
    try {
      liveContext = await loadLiveContext();
      sourceSummary.taskCount = (liveContext.tasks || []).length;
      sourceSummary.activityCount = (liveContext.activities || []).length;
      sourceSummary.messageCount = Object.values(liveContext.messagesByTask || {}).reduce(
        (sum, messages) => sum + (Array.isArray(messages) ? messages.length : 0),
        0
      );
      logEvent("info", "Loaded live context", {
        mode: config.mode,
        taskCount: (liveContext.tasks || []).length,
      });
    } catch (error) {
      degraded = true;
      usedSnapshot = Boolean(snapshot);
      const message = `Live context unavailable: ${String(error?.message || error)}`;
      errors.push(message);
      logEvent("warn", message);
      if (!snapshot) {
        snapshot = {
          generatedAt: Date.now(),
          source: "empty",
          agents: [],
          tasks: [],
          activities: [],
          messagesByTask: {},
          perAgent: {},
        };
      }
    }

    const raw = liveContext || snapshot;
    const agentState = buildAgentContext(raw, manualOverride, snapshot, existingWorkingState);
    const perAgentSummary = {};

    for (const agent of AGENTS) {
      perAgentSummary[agent.slug] = ensureAgentPack(
        agent,
        agentState[agent.slug],
        templates,
        date,
        runtimeSnapshot
      );
      sourceSummary.deltaCount += perAgentSummary[agent.slug].updatedCount;
    }

    writeRuntimeConfigShared(runtimeSnapshot);
    validatePack(date);

    const nextSnapshot = {
      generatedAt: Date.now(),
      source: liveContext ? "live" : "snapshot",
      mode: config.mode,
      perAgent: Object.fromEntries(
        AGENTS.map((agent) => [
          agent.slug,
          {
            instructions: agentState[agent.slug].instructions,
            userInstructions: agentState[agent.slug].userInstructions,
            chiefDirectives: agentState[agent.slug].chiefDirectives,
            activeTasks: agentState[agent.slug].activeTasks,
            evidencePaths: agentState[agent.slug].evidencePaths,
          },
        ])
      ),
    };
    writeJsonAtomic(config.snapshotFile, nextSnapshot);

    writeLastSyncReport({
      status: degraded ? "degraded_success" : "success",
      degraded,
      usedSnapshot,
      errors,
      perAgent: perAgentSummary,
      sources: sourceSummary,
    });

    logEvent("info", "Agent sync completed", {
      mode: config.mode,
      degraded,
      usedSnapshot,
      runtimeLoaded: runtimeSnapshot.loaded,
      updatedAgents: AGENTS.length,
    });
  } catch (error) {
    const errorText = String(error?.stack || error?.message || error);
    errors.push(errorText);
    writeLastSyncReport({
      status: "failed",
      degraded: true,
      usedSnapshot,
      errors,
      perAgent: {},
      sources: { taskCount: 0, activityCount: 0, messageCount: 0, deltaCount: 0 },
    });
    logEvent("error", "Agent sync failed", { error: errorText });
    throw error;
  } finally {
    releaseLockOnce();
    process.off("SIGINT", onTerminate);
    process.off("SIGTERM", onTerminate);
  }
}

main().catch((error) => {
  console.error("[agent-sync] failed:", error?.message || error);
  process.exitCode = 1;
});
