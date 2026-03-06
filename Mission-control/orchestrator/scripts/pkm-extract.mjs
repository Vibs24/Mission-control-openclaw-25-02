import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  ensureParaTree,
  ensureEntityFiles,
  upsertAtomicFact,
  updateCheckpoint,
  updateMetrics,
  listEntityKeys,
  readEntityFacts,
} from "../pkm/entity-store.mjs";
import { extractDurableFacts } from "../pkm/extractor.mjs";
import { qmdUpdate, qmdEmbed, isQmdAvailable } from "../pkm/qmd.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..");

function parseDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
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

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const env = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
  ...process.env,
};

const config = {
  mode: parseMode(process.argv.slice(2)),
  enabled: env.PKM_ENABLED !== "false",
  shadowMode: env.PKM_SHADOW_MODE !== "false",
  paraRoot: env.PKM_ROOT || path.join(workspaceRoot, "life"),
  convexUrl: env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL || "",
  convexAdminToken: env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN || "",
  lookbackDays: Math.max(1, safeNumber(env.AGENT_SYNC_LOOKBACK_DAYS || env.PKM_LOOKBACK_DAYS, 1)),
  mentionThreshold: Math.max(1, safeNumber(env.PKM_ENTITY_MENTION_THRESHOLD, 3)),
  qmdBin: env.QMD_BIN || "/opt/homebrew/bin/qmd",
  qmdUpdateAfterExtract: parseBool(env.QMD_UPDATE_AFTER_EXTRACT, true),
  qmdEmbedEveryRuns: Math.max(0, safeNumber(env.PKM_EMBED_EVERY_N_EXTRACT_RUNS, 0)),
  logPath: path.join(orchestratorDir, "logs", "pkm-extract.log"),
};

if (!config.convexUrl) {
  throw new Error("Missing MISSION_CONTROL_CONVEX_URL for pkm-extract");
}

function log(entry) {
  fs.mkdirSync(path.dirname(config.logPath), { recursive: true });
  fs.appendFileSync(config.logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

function buildHealthPayload(payload) {
  const optionalNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  return {
    key: String(payload?.key || "primary"),
    paraRoot: String(payload?.paraRoot || config.paraRoot),
    enabled: Boolean(payload?.enabled ?? config.enabled),
    shadowMode: typeof payload?.shadowMode === "boolean" ? payload.shadowMode : undefined,
    qmdAvailable: typeof payload?.qmdAvailable === "boolean" ? payload.qmdAvailable : undefined,
    qmdBin: payload?.qmdBin ? String(payload.qmdBin) : undefined,
    qmdCollections: Array.isArray(payload?.qmdCollections) ? payload.qmdCollections.map((item) => String(item)) : undefined,
    entities: optionalNumber(payload?.entities),
    facts: optionalNumber(payload?.facts),
    lastBootstrapAt: optionalNumber(payload?.lastBootstrapAt),
    lastExtractAt: optionalNumber(payload?.lastExtractAt),
    lastSynthesisAt: optionalNumber(payload?.lastSynthesisAt),
    lastQmdUpdateAt: optionalNumber(payload?.lastQmdUpdateAt),
    lastQmdEmbedAt: optionalNumber(payload?.lastQmdEmbedAt),
    checkpoint: payload?.checkpoint ?? undefined,
    metrics: payload?.metrics ?? undefined,
    lastExtractStats: payload?.lastExtractStats ?? undefined,
    lastSynthesisStats: payload?.lastSynthesisStats ?? undefined,
    bootstrapReport: payload?.bootstrapReport ?? undefined,
  };
}

async function syncHealth(client, payload) {
  try {
    await client.mutation(api.pkm.upsertHealth, buildHealthPayload(payload));
  } catch (error) {
    log({
      level: "warning",
      event: "pkm_extract_health_sync_failed",
      message: String(error?.message || error || ""),
    });
  }
}

async function fetchAllExecutionEvents(client, limit = 800) {
  const events = [];
  let cursor;
  let hasMore = true;
  while (hasMore && events.length < limit) {
    const page = await client.query((api).executionEvents.listRecent, {
      limit: Math.min(200, limit - events.length),
      cursor,
    });
    const rows = Array.isArray(page?.events) ? page.events : [];
    events.push(...rows);
    hasMore = Boolean(page?.hasMore) && rows.length > 0;
    cursor = page?.nextCursor;
    if (!cursor) break;
  }
  return events;
}

async function fetchTaskMessages(client, tasks = [], maxTasks = 120) {
  const selected = (tasks || []).slice(0, maxTasks);
  const all = [];
  for (const task of selected) {
    if (!task?._id) continue;
    const rows = await client.query((api).messages.listByTask, { taskId: task._id });
    if (Array.isArray(rows) && rows.length > 0) {
      all.push(...rows);
    }
  }
  return all;
}

function countFacts(rootDir) {
  const entityKeys = listEntityKeys(rootDir);
  let facts = 0;
  for (const key of entityKeys) {
    facts += readEntityFacts(rootDir, key).length;
  }
  return { entities: entityKeys.length, facts };
}

async function main() {
  if (!config.enabled) {
    console.log("[pkm-extract] PKM_ENABLED=false; skipping");
    return;
  }

  ensureParaTree(config.paraRoot);

  const client = new ConvexHttpClient(config.convexUrl);
  if (config.convexAdminToken) {
    client.setAdminAuth(config.convexAdminToken);
  }

  const [tasks, agents, activities, executionEvents, telegramEvents, squadMessages] = await Promise.all([
    client.query(api.tasks.list, {}),
    client.query(api.agents.list, {}),
    client.query((api).activities.list, { limit: 500 }),
    fetchAllExecutionEvents(client, 1000),
    client.query((api).telegram.listRecentIntakeEvents, { limit: 400 }).catch(() => []),
    client.query((api).chat.list, { channel: "general", limit: 300 }).catch(() => []),
  ]);

  const messages = await fetchTaskMessages(client, tasks, 150);

  const extracted = extractDurableFacts({
    tasks: Array.isArray(tasks) ? tasks : [],
    messages,
    activities: Array.isArray(activities) ? activities : [],
    executionEvents: Array.isArray(executionEvents) ? executionEvents : [],
    telegramEvents: Array.isArray(telegramEvents) ? telegramEvents : [],
    squadMessages: Array.isArray(squadMessages) ? squadMessages : [],
    agents: Array.isArray(agents) ? agents : [],
    lookbackDays: config.lookbackDays,
    mentionThreshold: config.mentionThreshold,
    now: Date.now(),
  });

  let createdFacts = 0;
  let updatedFacts = 0;
  let supersededFacts = 0;
  let skippedFacts = 0;

  for (const entity of extracted.entities) {
    ensureEntityFiles(config.paraRoot, entity.key, {
      title: entity.title,
      initialSummary: "Summary will be synthesized by weekly PKM synthesis.",
    });
    const rows = extracted.factsByEntity.get(entity.key) || [];
    for (const row of rows) {
      if (!row) {
        skippedFacts += 1;
        continue;
      }
      const result = upsertAtomicFact(config.paraRoot, entity.key, row);
      if (result.created) createdFacts += 1;
      if (result.updated) updatedFacts += 1;
      if (result.superseded) supersededFacts += 1;
      if (!result.created && !result.updated) skippedFacts += 1;
    }
  }

  const currentCounts = countFacts(config.paraRoot);
  const checkpoint = updateCheckpoint(config.paraRoot, {
    lastExtractAt: Date.now(),
    lastExtractMode: config.mode,
    shadowMode: config.shadowMode,
    lastExtractStats: {
      ...extracted.stats,
      createdFacts,
      updatedFacts,
      supersededFacts,
      skippedFacts,
    },
  });

  const metricsPath = path.join(config.paraRoot, ".state", "pkm-metrics.json");
  const previousMetrics = readJson(metricsPath, {});
  const previousRuns = Number(previousMetrics?.runs || 0);
  const nextRuns = previousRuns + 1;
  const metrics = updateMetrics(config.paraRoot, {
    runs: nextRuns,
    entities: currentCounts.entities,
    facts: currentCounts.facts,
    duplicateFactsSkipped: skippedFacts,
    lastRun: {
      at: Date.now(),
      mode: config.mode,
      shadowMode: config.shadowMode,
      extractedEntities: extracted.stats.totalEntities,
      extractedFacts: extracted.stats.totalFacts,
      createdFacts,
      updatedFacts,
      supersededFacts,
      skippedFacts,
    },
  });

  let qmdUpdateResult = { ok: false, skipped: true, reason: "disabled" };
  let qmdEmbedResult = { ok: false, skipped: true, reason: "disabled" };
  const qmdAvailable = isQmdAvailable(config.qmdBin);
  if (config.qmdUpdateAfterExtract && qmdAvailable) {
    qmdUpdateResult = qmdUpdate({ qmdBin: config.qmdBin, cwd: workspaceRoot });
  }
  if (qmdAvailable && config.qmdEmbedEveryRuns > 0 && nextRuns % config.qmdEmbedEveryRuns === 0) {
    qmdEmbedResult = qmdEmbed({ qmdBin: config.qmdBin, cwd: workspaceRoot });
  }

  const lastQmdUpdateAt = qmdUpdateResult.ok ? Date.now() : checkpoint?.lastQmdUpdateAt ?? null;
  const lastQmdEmbedAt = qmdEmbedResult.ok ? Date.now() : checkpoint?.lastQmdEmbedAt ?? null;
  const checkpointWithQmd = updateCheckpoint(config.paraRoot, {
    lastQmdUpdateAt,
    lastQmdEmbedAt,
  });

  const report = {
    key: "primary",
    mode: config.mode,
    paraRoot: config.paraRoot,
    enabled: config.enabled,
    shadowMode: config.shadowMode,
    lookbackDays: config.lookbackDays,
    entityMentionThreshold: config.mentionThreshold,
    createdFacts,
    updatedFacts,
    supersededFacts,
    skippedFacts,
    extractedStats: extracted.stats,
    paraCounts: currentCounts,
    qmdAvailable,
    qmdBin: config.qmdBin,
    qmdCollections: ["life", "memory", "agents"],
    entities: currentCounts.entities,
    facts: currentCounts.facts,
    lastExtractAt: Number(checkpoint?.lastExtractAt || Date.now()),
    lastQmdUpdateAt,
    lastQmdEmbedAt,
    qmdUpdate: qmdUpdateResult,
    qmdEmbed: qmdEmbedResult,
    checkpoint: checkpointWithQmd,
    metrics,
    lastExtractStats: {
      ...extracted.stats,
      createdFacts,
      updatedFacts,
      supersededFacts,
      skippedFacts,
    },
  };

  await syncHealth(client, report);
  log({ level: "info", event: "pkm_extract_complete", ...report });
  console.log("[pkm-extract] complete", JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = String(error?.stack || error?.message || error);
  log({ level: "error", event: "pkm_extract_failed", message });
  console.error("[pkm-extract] failed", message);
  process.exitCode = 1;
});
