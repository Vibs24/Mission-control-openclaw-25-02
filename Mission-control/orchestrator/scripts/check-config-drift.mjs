import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const logsDir = path.join(orchestratorDir, "logs");
const driftLogPath = path.join(logsDir, "openclaw-config-drift.log");
const syncScriptPath = path.join(__dirname, "sync-openclaw-config.mjs");

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

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set((items || []).map((v) => String(v || "").trim()).filter(Boolean))];
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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function equalsJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareTarget({ canonicalConfig, targetConfig, providerKey, authProfileKey }) {
  const mismatches = [];

  const canonicalProvider = canonicalConfig?.models?.providers?.[providerKey] || null;
  const targetProvider = targetConfig?.models?.providers?.[providerKey] || null;
  if (!equalsJson(canonicalProvider, targetProvider)) {
    mismatches.push({
      key: `models.providers.${providerKey}`,
      canonical: canonicalProvider,
      target: targetProvider,
    });
  }

  const canonicalBaseUrl = String(canonicalProvider?.baseUrl || "").trim();
  const targetBaseUrl = String(targetProvider?.baseUrl || "").trim();
  if (canonicalBaseUrl !== targetBaseUrl) {
    mismatches.push({
      key: `models.providers.${providerKey}.baseUrl`,
      canonical: canonicalBaseUrl,
      target: targetBaseUrl,
    });
  }

  const canonicalAuth = canonicalConfig?.auth?.profiles?.[authProfileKey] || null;
  const targetAuth = targetConfig?.auth?.profiles?.[authProfileKey] || null;
  if (!equalsJson(canonicalAuth, targetAuth)) {
    mismatches.push({
      key: `auth.profiles.${authProfileKey}`,
      canonical: canonicalAuth,
      target: targetAuth,
    });
  }

  const canonicalPrimaryModel = String(canonicalConfig?.agents?.defaults?.model?.primary || "").trim();
  const targetPrimaryModel = String(targetConfig?.agents?.defaults?.model?.primary || "").trim();
  if (canonicalPrimaryModel !== targetPrimaryModel) {
    mismatches.push({
      key: "agents.defaults.model.primary",
      canonical: canonicalPrimaryModel,
      target: targetPrimaryModel,
    });
  }

  const canonicalFallbacks = Array.isArray(canonicalConfig?.agents?.defaults?.model?.fallbacks)
    ? canonicalConfig.agents.defaults.model.fallbacks
    : [];
  const targetFallbacks = Array.isArray(targetConfig?.agents?.defaults?.model?.fallbacks)
    ? targetConfig.agents.defaults.model.fallbacks
    : [];
  if (!equalsJson(canonicalFallbacks, targetFallbacks)) {
    mismatches.push({
      key: "agents.defaults.model.fallbacks",
      canonical: canonicalFallbacks,
      target: targetFallbacks,
    });
  }

  return mismatches;
}

function writeDriftLog(entry) {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(driftLogPath, `${JSON.stringify(entry)}\n`);
}

function runSync(mode) {
  const result = spawnSync(process.execPath, [syncScriptPath, "--mode", mode], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
  });
  return {
    code: Number(result.status ?? 1),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

const localEnv = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
};
const env = {
  ...localEnv,
  ...process.env,
};

const providerKey = String(env.OPENCLAW_PROVIDER_LOCK || "openai-codex").trim();
const authProfileKey = `${providerKey}:default`;
const openclawProfile = String(env.OPENCLAW_PROFILE || "mc2").trim();
const canonicalHome = String(
  env.OPENCLAW_CONFIG_CANONICAL_HOME ||
    resolveOpenClawHome(openclawProfile, env.OPENCLAW_HOME || "")
).trim();
const defaultTargets = [
  path.join(os.homedir(), ".openclaw"),
  canonicalHome,
  path.join(workspaceRoot, ".openclaw-home", ".openclaw"),
];
const targetHomes = unique(
  parseCsv(env.OPENCLAW_CONFIG_TARGET_HOMES).length > 0
    ? parseCsv(env.OPENCLAW_CONFIG_TARGET_HOMES)
    : defaultTargets
);

const config = {
  mode: parseMode(process.argv.slice(2)),
  strictArg: process.argv.includes("--strict"),
  strictEnv: parseBool(env.OPENCLAW_CONFIG_STRICT_STARTUP, true),
  autoHeal: parseBool(env.OPENCLAW_CONFIG_AUTO_HEAL, true),
  canonicalConfigPath: path.join(canonicalHome, "openclaw.json"),
  targetHomes,
  providerKey,
  authProfileKey,
};

async function main() {
  const strict = config.strictArg || config.strictEnv;
  const runEntry = {
    at: new Date().toISOString(),
    mode: config.mode,
    strict,
    autoHeal: config.autoHeal,
    providerKey: config.providerKey,
    authProfileKey: config.authProfileKey,
    canonicalConfigPath: config.canonicalConfigPath,
    driftDetected: false,
    healed: false,
    unresolved: false,
    targets: [],
    errors: [],
  };

  const canonicalConfig = readJson(config.canonicalConfigPath);
  if (!canonicalConfig || typeof canonicalConfig !== "object") {
    const message = `canonical config missing/unreadable: ${config.canonicalConfigPath}`;
    runEntry.errors.push(message);
    runEntry.unresolved = true;
    writeDriftLog(runEntry);
    console.error("[check-config-drift]", message);
    process.exitCode = strict ? 1 : 0;
    return;
  }

  const collectDrift = () => {
    const targetResults = [];
    for (const home of config.targetHomes) {
      const configPath = path.join(home, "openclaw.json");
      const targetConfig = readJson(configPath);
      if (!targetConfig || typeof targetConfig !== "object") {
        targetResults.push({
          home,
          configPath,
          drift: true,
          mismatches: [{ key: "openclaw.json", reason: "missing_or_unreadable" }],
        });
        continue;
      }
      const mismatches = compareTarget({
        canonicalConfig,
        targetConfig,
        providerKey: config.providerKey,
        authProfileKey: config.authProfileKey,
      });
      targetResults.push({
        home,
        configPath,
        drift: mismatches.length > 0,
        mismatches,
      });
    }
    return targetResults;
  };

  let targets = collectDrift();
  runEntry.targets = targets;
  runEntry.driftDetected = targets.some((target) => target.drift);

  if (runEntry.driftDetected && config.autoHeal) {
    const heal = runSync(config.mode);
    runEntry.autoHealRun = {
      code: heal.code,
      stdout: heal.stdout.slice(0, 2000),
      stderr: heal.stderr.slice(0, 2000),
    };
    if (heal.code !== 0) {
      runEntry.errors.push("auto-heal sync failed");
    } else {
      runEntry.healed = true;
      targets = collectDrift();
      runEntry.targets = targets;
    }
  }

  runEntry.unresolved = runEntry.targets.some((target) => target.drift);
  writeDriftLog(runEntry);
  console.log(JSON.stringify(runEntry, null, 2));

  if (strict && runEntry.unresolved) {
    console.error("[check-config-drift] unresolved drift under strict mode");
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  const message = String(error?.message || error);
  writeDriftLog({
    at: new Date().toISOString(),
    mode: config.mode,
    strict: config.strictArg || config.strictEnv,
    autoHeal: config.autoHeal,
    error: message,
  });
  console.error("[check-config-drift] failed:", message);
  process.exitCode = 1;
});
