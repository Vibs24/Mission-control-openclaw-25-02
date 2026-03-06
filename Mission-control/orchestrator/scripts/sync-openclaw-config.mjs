import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const logsDir = path.join(orchestratorDir, "logs");

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

function resolveOpenClawHome(profile, explicitHome = "") {
  const fromEnv = String(explicitHome || "").trim();
  if (fromEnv) return fromEnv;
  const normalizedProfile = String(profile || "").trim();
  if (!normalizedProfile || normalizedProfile === "default") {
    return path.join(os.homedir(), ".openclaw");
  }
  return path.join(os.homedir(), `.openclaw-${normalizedProfile}`);
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function ensureObject(root, key) {
  if (!root[key] || typeof root[key] !== "object" || Array.isArray(root[key])) {
    root[key] = {};
  }
  return root[key];
}

function fingerprint(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return crypto.createHash("sha256").update(text).digest("hex");
}

function maskFingerprint(value) {
  const hash = fingerprint(value);
  return `***${hash.slice(-8)}`;
}

function writeJsonAtomicWithBackup(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let backupPath = "";
  if (fs.existsSync(filePath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = `${filePath}.bak.${stamp}`;
    fs.copyFileSync(filePath, backupPath);
  }
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
  return backupPath;
}

function readByPath(root, route) {
  const parts = String(route || "").split(".");
  let cursor = root;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function valuesDiffer(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function deriveSecretFingerprint(authProfile = {}, env = {}) {
  const candidates = [
    authProfile?.apiKey,
    authProfile?.token,
    authProfile?.accessToken,
    authProfile?.key,
    env.OPENAI_API_KEY,
    env.OPENAI_CODEX_API_KEY,
    env.OPENAI_API_TOKEN,
  ];
  const secret = candidates.find((v) => String(v || "").trim().length > 0);
  if (!secret) return "unavailable";
  return maskFingerprint(String(secret));
}

function normalizeTargetConfig({
  targetConfig,
  canonicalConfig,
  providerKey,
  authProfileKey,
  primaryModel,
  fallbackModels,
}) {
  const next = targetConfig && typeof targetConfig === "object" ? structuredClone(targetConfig) : {};
  const changedKeys = [];
  const compareAndSet = (route, value) => {
    const previous = readByPath(next, route);
    if (!valuesDiffer(previous, value)) return;
    changedKeys.push(route);
    const parts = route.split(".");
    let cursor = next;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[parts[parts.length - 1]] = value;
  };

  const canonicalProvider = canonicalConfig?.models?.providers?.[providerKey];
  const canonicalAuth = canonicalConfig?.auth?.profiles?.[authProfileKey];
  const canonicalModelAliases = canonicalConfig?.agents?.defaults?.models || {};

  compareAndSet("models.mode", canonicalConfig?.models?.mode || "merge");
  compareAndSet(`models.providers.${providerKey}`, canonicalProvider);
  compareAndSet(`auth.profiles.${authProfileKey}`, canonicalAuth);
  compareAndSet("agents.defaults.model.primary", primaryModel);
  compareAndSet("agents.defaults.model.fallbacks", fallbackModels);

  const aliasesRoot = ensureObject(ensureObject(next, "agents"), "defaults");
  const aliases = ensureObject(aliasesRoot, "models");
  for (const modelId of [primaryModel, ...fallbackModels]) {
    if (!modelId) continue;
    const desired = canonicalModelAliases[modelId] || aliases[modelId] || {};
    if (!valuesDiffer(aliases[modelId], desired)) continue;
    aliases[modelId] = desired;
    changedKeys.push(`agents.defaults.models.${modelId}`);
  }

  return { next, changedKeys: unique(changedKeys) };
}

function validateCanonical({ canonicalConfig, providerKey, authProfileKey }) {
  if (!canonicalConfig || typeof canonicalConfig !== "object") {
    throw new Error("canonical config missing/unreadable");
  }
  const providerConfig = canonicalConfig?.models?.providers?.[providerKey];
  if (!providerConfig || typeof providerConfig !== "object") {
    throw new Error(`canonical provider missing: ${providerKey}`);
  }
  const baseUrl = String(providerConfig?.baseUrl || "").trim();
  if (!baseUrl) {
    throw new Error(`canonical provider baseUrl missing: ${providerKey}`);
  }
  const authProfile = canonicalConfig?.auth?.profiles?.[authProfileKey];
  if (!authProfile || typeof authProfile !== "object") {
    throw new Error(`canonical auth profile missing: ${authProfileKey}`);
  }
  const primaryModel = String(canonicalConfig?.agents?.defaults?.model?.primary || "").trim();
  if (!primaryModel) {
    throw new Error("canonical primary model missing");
  }
  return {
    providerConfig,
    baseUrl,
    authProfile,
    primaryModel,
    fallbackModels: Array.isArray(canonicalConfig?.agents?.defaults?.model?.fallbacks)
      ? canonicalConfig.agents.defaults.model.fallbacks.map((m) => String(m || "").trim()).filter(Boolean)
      : [],
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
  enabled: env.OPENCLAW_CONFIG_SYNC_ENABLED !== "false",
  providerKey,
  authProfileKey,
  canonicalHome,
  canonicalConfigPath: path.join(canonicalHome, "openclaw.json"),
  targetHomes,
  reportPath:
    env.OPENCLAW_CONFIG_SYNC_REPORT_FILE ||
    path.join(logsDir, "openclaw-config-sync.json"),
};

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  if (!config.enabled) {
    console.log("[sync-openclaw-config] OPENCLAW_CONFIG_SYNC_ENABLED=false, skipping.");
    return;
  }

  const report = {
    at: new Date().toISOString(),
    mode: config.mode,
    canonicalConfigPath: config.canonicalConfigPath,
    providerKey: config.providerKey,
    authProfileKey: config.authProfileKey,
    targetHomes: config.targetHomes,
    changedTargets: 0,
    targets: [],
    warnings: [],
    errors: [],
  };

  try {
    const canonicalConfig = readJson(config.canonicalConfigPath);
    const canonical = validateCanonical({
      canonicalConfig,
      providerKey: config.providerKey,
      authProfileKey: config.authProfileKey,
    });
    const canonicalAuthSecretFingerprint = deriveSecretFingerprint(canonical.authProfile, env);

    report.canonical = {
      profile: openclawProfile,
      home: config.canonicalHome,
      modelPrimary: canonical.primaryModel,
      modelFallbacks: canonical.fallbackModels,
      providerBaseUrl: canonical.baseUrl,
      providerFingerprint: maskFingerprint(canonical.providerConfig),
      authMode: String(canonical.authProfile?.mode || "").trim() || "unknown",
      authProvider: String(canonical.authProfile?.provider || "").trim() || "unknown",
      authSecretFingerprint: canonicalAuthSecretFingerprint,
    };

    for (const home of config.targetHomes) {
      const targetConfigPath = path.join(home, "openclaw.json");
      const currentConfig = readJson(targetConfigPath) || {};
      const beforeProvider = currentConfig?.models?.providers?.[config.providerKey] || null;
      const beforeAuthProfile = currentConfig?.auth?.profiles?.[config.authProfileKey] || null;
      const beforePrimaryModel = String(currentConfig?.agents?.defaults?.model?.primary || "");
      const beforeFallbacks = Array.isArray(currentConfig?.agents?.defaults?.model?.fallbacks)
        ? currentConfig.agents.defaults.model.fallbacks
        : [];
      const beforeTelegramToken = String(currentConfig?.channels?.telegram?.botToken || "");

      const { next, changedKeys } = normalizeTargetConfig({
        targetConfig: currentConfig,
        canonicalConfig,
        providerKey: config.providerKey,
        authProfileKey: config.authProfileKey,
        primaryModel: canonical.primaryModel,
        fallbackModels: canonical.fallbackModels,
      });

      const afterTelegramToken = String(next?.channels?.telegram?.botToken || "");
      const telegramTokenUnchanged = beforeTelegramToken === afterTelegramToken;
      if (!telegramTokenUnchanged) {
        report.warnings.push(
          `Telegram token changed unexpectedly for target ${home}; preserving target token as-is.`
        );
        ensureObject(ensureObject(next, "channels"), "telegram").botToken = beforeTelegramToken;
      }

      let changed = changedKeys.length > 0;
      const beforeRelevant = {
        provider: beforeProvider,
        authProfile: beforeAuthProfile,
        primaryModel: beforePrimaryModel,
        fallbacks: beforeFallbacks,
      };
      const afterRelevant = {
        provider: next?.models?.providers?.[config.providerKey] || null,
        authProfile: next?.auth?.profiles?.[config.authProfileKey] || null,
        primaryModel: String(next?.agents?.defaults?.model?.primary || ""),
        fallbacks: Array.isArray(next?.agents?.defaults?.model?.fallbacks)
          ? next.agents.defaults.model.fallbacks
          : [],
      };
      changed = changed || valuesDiffer(beforeRelevant, afterRelevant);

      let backupPath = "";
      if (changed) {
        backupPath = writeJsonAtomicWithBackup(targetConfigPath, next);
        report.changedTargets += 1;
      }

      report.targets.push({
        home,
        configPath: targetConfigPath,
        changed,
        backupPath,
        changedKeys,
        providerBaseUrl: String(afterRelevant.provider?.baseUrl || ""),
        providerFingerprint: maskFingerprint(afterRelevant.provider || {}),
        authMode: String(afterRelevant.authProfile?.mode || "").trim() || "unknown",
        authProvider: String(afterRelevant.authProfile?.provider || "").trim() || "unknown",
        authSecretFingerprint: deriveSecretFingerprint(afterRelevant.authProfile, env),
        primaryModel: afterRelevant.primaryModel,
        fallbackCount: Array.isArray(afterRelevant.fallbacks) ? afterRelevant.fallbacks.length : 0,
        telegramTokenPreserved: telegramTokenUnchanged,
      });
    }
  } catch (error) {
    report.errors.push(String(error?.message || error));
    fs.writeFileSync(config.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error("[sync-openclaw-config] failed:", error?.message || error);
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(config.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[sync-openclaw-config] failed:", error?.message || error);
  process.exitCode = 1;
});
