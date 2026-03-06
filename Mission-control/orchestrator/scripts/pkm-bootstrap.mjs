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
import {
  defaultQmdCollections,
  ensureQmdCollections,
  isQmdAvailable,
} from "../pkm/qmd.mjs";

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

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
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
  memoryRoot: path.join(workspaceRoot, "memory"),
  agentsRoot: path.join(projectRoot, "agents"),
  tacitFile: path.join(projectRoot, "agents", "_shared", "TACIT_KNOWLEDGE.md"),
  qmdBin: env.QMD_BIN || "/opt/homebrew/bin/qmd",
  qmdCollectionLife: env.QMD_COLLECTION_LIFE || "life",
  qmdCollectionMemory: env.QMD_COLLECTION_MEMORY || "memory",
  qmdCollectionAgents: env.QMD_COLLECTION_AGENTS || "agents",
  convexUrl: env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL || "",
  convexAdminToken: env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN || "",
  logPath: path.join(orchestratorDir, "logs", "pkm-bootstrap.log"),
};

function log(entry) {
  fs.mkdirSync(path.dirname(config.logPath), { recursive: true });
  fs.appendFileSync(config.logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}

function buildHealthPayload(report) {
  const optionalNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  return {
    key: String(report?.key || "primary"),
    paraRoot: String(report?.paraRoot || config.paraRoot),
    enabled: Boolean(report?.enabled ?? config.enabled),
    qmdAvailable: typeof report?.qmdAvailable === "boolean" ? report.qmdAvailable : undefined,
    qmdBin: report?.qmdBin ? String(report.qmdBin) : undefined,
    qmdCollections: Array.isArray(report?.qmdCollections) ? report.qmdCollections.map((item) => String(item)) : undefined,
    entities: optionalNumber(report?.entities),
    facts: optionalNumber(report?.facts),
    lastBootstrapAt: optionalNumber(report?.lastBootstrapAt),
    lastExtractAt: optionalNumber(report?.lastExtractAt),
    lastSynthesisAt: optionalNumber(report?.lastSynthesisAt),
    lastQmdUpdateAt: optionalNumber(report?.lastQmdUpdateAt),
    lastQmdEmbedAt: optionalNumber(report?.lastQmdEmbedAt),
    checkpoint: report?.checkpoint ?? undefined,
    metrics: report?.metrics ?? undefined,
    lastExtractStats: report?.lastExtractStats ?? undefined,
    lastSynthesisStats: report?.lastSynthesisStats ?? undefined,
    bootstrapReport: report?.bootstrapReport ?? undefined,
  };
}

async function syncHealth(report) {
  if (!config.convexUrl) return;
  try {
    const client = new ConvexHttpClient(config.convexUrl);
    if (config.convexAdminToken) {
      client.setAdminAuth(config.convexAdminToken);
    }
    await client.mutation(api.pkm.upsertHealth, buildHealthPayload(report));
  } catch (error) {
    log({
      level: "warning",
      event: "pkm_bootstrap_health_sync_failed",
      message: String(error?.message || error || ""),
    });
  }
}

async function main() {
  if (!config.enabled) {
    console.log("[pkm-bootstrap] PKM_ENABLED=false; skipping");
    return;
  }

  ensureParaTree(config.paraRoot);
  fs.mkdirSync(config.memoryRoot, { recursive: true });
  fs.mkdirSync(path.dirname(config.tacitFile), { recursive: true });

  if (!fs.existsSync(config.tacitFile)) {
    atomicWrite(
      config.tacitFile,
      [
        "# TACIT_KNOWLEDGE.md",
        "",
        "Long-lived operator patterns and preferences for Mission Control.",
        "",
        "- Update only when a durable behavior pattern is confirmed.",
        "- Keep concise and operationally useful.",
        "",
      ].join("\n")
    );
  }

  const collections = defaultQmdCollections({
    paraRoot: config.paraRoot,
    memoryRoot: config.memoryRoot,
    agentsRoot: config.agentsRoot,
  }).map((entry) => {
    if (entry.name === "life") return { ...entry, name: config.qmdCollectionLife };
    if (entry.name === "memory") return { ...entry, name: config.qmdCollectionMemory };
    if (entry.name === "agents") return { ...entry, name: config.qmdCollectionAgents };
    return entry;
  });

  const qmdAvailable = isQmdAvailable(config.qmdBin);
  const qmdSetup = ensureQmdCollections({
    qmdBin: config.qmdBin,
    collections,
    cwd: workspaceRoot,
  });

  const checkpoint = updateCheckpoint(config.paraRoot, {
    mode: config.mode,
    bootstrapAt: Date.now(),
    qmdAvailable,
  });

  updateMetrics(config.paraRoot, {
    bootstrapAt: Date.now(),
  });

  const result = {
    key: "primary",
    paraRoot: config.paraRoot,
    enabled: config.enabled,
    qmdBin: config.qmdBin,
    qmdCollections: [
      config.qmdCollectionLife,
      config.qmdCollectionMemory,
      config.qmdCollectionAgents,
    ],
    tacitFile: config.tacitFile,
    qmdAvailable,
    qmdSetup,
    lastBootstrapAt: Number(checkpoint?.bootstrapAt || Date.now()),
    checkpoint,
    bootstrapReport: {
      paraRoot: config.paraRoot,
      tacitFile: config.tacitFile,
      qmdAvailable,
      qmdSetup,
    },
  };

  await syncHealth(result);
  log({ level: "info", event: "pkm_bootstrap", ...result });
  console.log("[pkm-bootstrap] complete", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = String(error?.stack || error?.message || error);
  log({ level: "error", event: "pkm_bootstrap_failed", message });
  console.error("[pkm-bootstrap] failed", message);
  process.exitCode = 1;
});
