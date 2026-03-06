import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  ensureParaTree,
  updateCheckpoint,
  updateMetrics,
} from "../pkm/entity-store.mjs";
import { synthesizeAllEntities } from "../pkm/synthesis.mjs";
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

const env = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
  ...process.env,
};

const config = {
  mode: parseMode(process.argv.slice(2)),
  enabled: env.PKM_ENABLED !== "false",
  paraRoot: env.PKM_ROOT || path.join(workspaceRoot, "life"),
  qmdBin: env.QMD_BIN || "/opt/homebrew/bin/qmd",
  convexUrl: env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL || "",
  convexAdminToken: env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN || "",
  updateQmd: parseBool(env.QMD_UPDATE_AFTER_EXTRACT, true),
  embedAfterSynthesis: parseBool(env.PKM_EMBED_AFTER_SYNTHESIS, true),
  logPath: path.join(orchestratorDir, "logs", "pkm-synthesize.log"),
};

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

async function syncHealth(payload) {
  if (!config.convexUrl) return;
  try {
    const client = new ConvexHttpClient(config.convexUrl);
    if (config.convexAdminToken) {
      client.setAdminAuth(config.convexAdminToken);
    }
    await client.mutation(api.pkm.upsertHealth, buildHealthPayload(payload));
  } catch (error) {
    log({
      level: "warning",
      event: "pkm_synthesis_health_sync_failed",
      message: String(error?.message || error || ""),
    });
  }
}

async function main() {
  if (!config.enabled) {
    console.log("[pkm-synthesize] PKM_ENABLED=false; skipping");
    return;
  }
  ensureParaTree(config.paraRoot);
  const summary = synthesizeAllEntities(config.paraRoot, Date.now());

  const checkpoint = updateCheckpoint(config.paraRoot, {
    lastSynthesisAt: Date.now(),
    lastSynthesisMode: config.mode,
    lastSynthesisStats: summary,
  });

  const metrics = updateMetrics(config.paraRoot, {
    entities: summary.totalEntities,
    facts: summary.totalFacts,
    lastSynthesis: {
      at: Date.now(),
      mode: config.mode,
      changedEntities: summary.changedEntities,
      totalEntities: summary.totalEntities,
    },
  });

  const qmdAvailable = isQmdAvailable(config.qmdBin);
  const qmdUpdateResult = config.updateQmd && qmdAvailable
    ? qmdUpdate({ qmdBin: config.qmdBin, cwd: workspaceRoot })
    : { ok: false, skipped: true, reason: "disabled" };

  const qmdEmbedResult = config.embedAfterSynthesis && qmdAvailable
    ? qmdEmbed({ qmdBin: config.qmdBin, cwd: workspaceRoot })
    : { ok: false, skipped: true, reason: "disabled" };

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
    qmdBin: config.qmdBin,
    qmdCollections: ["life", "memory", "agents"],
    ...summary,
    entities: summary.totalEntities,
    facts: summary.totalFacts,
    qmdAvailable,
    lastSynthesisAt: Number(checkpoint?.lastSynthesisAt || Date.now()),
    lastQmdUpdateAt,
    lastQmdEmbedAt,
    qmdUpdate: qmdUpdateResult,
    qmdEmbed: qmdEmbedResult,
    checkpoint: checkpointWithQmd,
    metrics,
    lastSynthesisStats: summary,
  };

  await syncHealth(report);
  log({ level: "info", event: "pkm_synthesis_complete", ...report });
  console.log("[pkm-synthesize] complete", JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = String(error?.stack || error?.message || error);
  log({ level: "error", event: "pkm_synthesis_failed", message });
  console.error("[pkm-synthesize] failed", message);
  process.exitCode = 1;
});
