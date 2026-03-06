import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const logsDir = path.join(orchestratorDir, "logs");

const ROLE_AGENTS = [
  { id: "chief", name: "Chief", roleKey: "chief" },
  { id: "project-manager", name: "Project Manager", roleKey: "project_manager" },
  { id: "frontend", name: "Frontend", roleKey: "frontend" },
  { id: "designer", name: "Designer", roleKey: "designer" },
  { id: "database", name: "Database", roleKey: "database" },
  { id: "backend", name: "Backend", roleKey: "backend" },
  { id: "documentation", name: "Documentation", roleKey: "documentation" },
  { id: "operations", name: "Operations", roleKey: "operations" },
  { id: "reviewer", name: "Reviewer", roleKey: "reviewer" },
];
const AUTH_ERROR_PATTERNS = [
  /401\s+Incorrect API key provided/i,
  /invalid api key/i,
  /unauthorized/i,
  /authentication failed/i,
  /invalid_auth/i,
];
const OPENAI_CODEX_PROVIDER_KEY = "openai-codex";
const OPENAI_CODEX_PRIMARY_MODEL = "openai-codex/gpt-5.3-codex";
const OPENAI_CODEX_FALLBACK_MODELS = [
  "openai-codex/gpt-5.2-codex",
  "openai/gpt-5.2-codex",
];

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

function resolveOpenclawHome(profile, explicitHome = "") {
  const fromEnv = String(explicitHome || "").trim();
  if (fromEnv) return fromEnv;
  const normalizedProfile = String(profile || "").trim();
  if (!normalizedProfile || normalizedProfile === "default") {
    return path.join(os.homedir(), ".openclaw");
  }
  return path.join(os.homedir(), `.openclaw-${normalizedProfile}`);
}

function runCommand(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    code: Number(result.status ?? 1),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function backupAndWriteJson(filePath, data) {
  if (fs.existsSync(filePath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.bak.${ts}`;
    fs.copyFileSync(filePath, backupPath);
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function extractProbeText(result) {
  const parts = [];
  if (result?.stderr) parts.push(String(result.stderr));
  if (result?.stdout) parts.push(String(result.stdout));
  const parsed = parseJsonOutput(result?.stdout || "");
  const payloads = parsed?.result?.payloads;
  if (Array.isArray(payloads)) {
    for (const payload of payloads) {
      if (payload?.text) parts.push(String(payload.text));
    }
  }
  return parts.join("\n");
}

function detectAuthError(result) {
  const text = extractProbeText(result);
  const matched = AUTH_ERROR_PATTERNS.find((re) => re.test(text));
  return {
    matched: Boolean(matched),
    reason: matched ? text.slice(0, 300) : "",
    text,
  };
}

function ensureObject(root, key) {
  if (!root[key] || typeof root[key] !== "object" || Array.isArray(root[key])) {
    root[key] = {};
  }
  return root[key];
}

function ensureOpenaiCodexConfig({ targetConfigPath, sourceConfigPath }) {
  const target = readJsonFile(targetConfigPath);
  if (!target || typeof target !== "object") {
    return { repaired: false, reason: `target config missing/unreadable: ${targetConfigPath}` };
  }
  const source = readJsonFile(sourceConfigPath);
  if (!source || typeof source !== "object") {
    return { repaired: false, reason: `source config missing/unreadable: ${sourceConfigPath}` };
  }

  const sourceProvider = source?.models?.providers?.[OPENAI_CODEX_PROVIDER_KEY];
  if (!sourceProvider) {
    return { repaired: false, reason: "source profile missing openai-codex provider" };
  }
  const sourceAuthProfile = source?.auth?.profiles?.["openai-codex:default"] || {
    provider: OPENAI_CODEX_PROVIDER_KEY,
    mode: "oauth",
  };

  const models = ensureObject(target, "models");
  models.mode = models.mode || "merge";
  const providers = ensureObject(models, "providers");
  providers[OPENAI_CODEX_PROVIDER_KEY] = sourceProvider;

  const auth = ensureObject(target, "auth");
  const profiles = ensureObject(auth, "profiles");
  profiles["openai-codex:default"] = sourceAuthProfile;

  const agents = ensureObject(target, "agents");
  const defaults = ensureObject(agents, "defaults");
  const model = ensureObject(defaults, "model");
  model.primary = OPENAI_CODEX_PRIMARY_MODEL;
  model.fallbacks = OPENAI_CODEX_FALLBACK_MODELS.slice();
  const modelAliases = ensureObject(defaults, "models");
  modelAliases[OPENAI_CODEX_PRIMARY_MODEL] = modelAliases[OPENAI_CODEX_PRIMARY_MODEL] || {
    alias: "GPT-5.3 Codex",
  };
  modelAliases[OPENAI_CODEX_FALLBACK_MODELS[0]] = modelAliases[OPENAI_CODEX_FALLBACK_MODELS[0]] || {
    alias: "GPT-5.2 Codex",
  };
  modelAliases[OPENAI_CODEX_FALLBACK_MODELS[1]] = modelAliases[OPENAI_CODEX_FALLBACK_MODELS[1]] || {};

  backupAndWriteJson(targetConfigPath, target);
  return { repaired: true, reason: "updated profile to openai-codex oauth runtime defaults" };
}

function writeRoleStub(agentDir, roleAgent) {
  fs.mkdirSync(agentDir, { recursive: true });
  const stubPath = path.join(agentDir, "ROLE_AGENT.md");
  const contents = [
    "# Role Agent Stub",
    "",
    `- Agent ID: ${roleAgent.id}`,
    `- Display Name: ${roleAgent.name}`,
    `- Role Key: ${roleAgent.roleKey}`,
    `- Provisioned At: ${new Date().toISOString()}`,
    "",
    "This file is managed by provision-role-agents.mjs.",
    "",
  ].join("\n");
  fs.writeFileSync(stubPath, contents);
  return stubPath;
}

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  const env = {
    ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
    ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
    ...process.env,
  };

  const openclawBin = env.OPENCLAW_BIN || "openclaw";
  const openclawProfile = env.OPENCLAW_PROFILE || "mc2";
  const openclawHome = resolveOpenclawHome(openclawProfile, env.OPENCLAW_HOME);
  const strictRoleRouting = env.STRICT_ROLE_ROUTING !== "false";
  const dryRunEnabled = env.ROLE_AGENT_DISPATCH_DRY_RUN === "true";
  const dryRunHardFail = env.ROLE_AGENT_DISPATCH_DRY_RUN_HARD_FAIL === "true";
  const authPreflightEnabled = env.ROLE_AGENT_AUTH_PREFLIGHT_ENABLED !== "false";
  const authAutoRepairEnabled = env.ROLE_AGENT_AUTH_AUTO_REPAIR !== "false";
  const authProbeAgentId = String(env.ROLE_AGENT_AUTH_PREFLIGHT_AGENT || "chief");
  const canonicalAuthSourceHome = String(
    env.OPENCLAW_CONFIG_CANONICAL_HOME || resolveOpenclawHome(openclawProfile, env.OPENCLAW_HOME || "")
  ).trim();
  const authSourceHome = String(env.ROLE_AGENT_AUTH_SOURCE_HOME || canonicalAuthSourceHome).trim();
  const authSourceExplicit = Boolean(String(env.ROLE_AGENT_AUTH_SOURCE_HOME || "").trim());
  const sharedWorkspace =
    env.OPENCLAW_AGENT_WORKSPACE || env.OPENCLAW_WORKSPACE || workspaceRoot;

  const report = {
    at: new Date().toISOString(),
    openclawBin,
    openclawProfile,
    openclawHome,
    sharedWorkspace,
    strictRoleRouting,
    createdAgents: [],
    existingAgents: [],
    missingAfterProvision: [],
    roleStubs: [],
    dryRun: {
      enabled: dryRunEnabled,
      hardFail: dryRunHardFail,
      passed: [],
      failed: [],
    },
    authPreflight: {
      enabled: authPreflightEnabled,
      autoRepairEnabled: authAutoRepairEnabled,
      probeAgentId: authProbeAgentId,
      sourceHome: authSourceHome,
      sourceMode: authSourceExplicit ? "explicit_override" : "canonical_default",
      attemptedRepair: false,
      repaired: false,
      healthy: false,
      before: "",
      after: "",
    },
    errors: [],
  };

  const legacyDefaultHome = path.join(os.homedir(), ".openclaw");
  if (
    !authSourceExplicit &&
    path.resolve(authSourceHome) === path.resolve(legacyDefaultHome) &&
    path.resolve(canonicalAuthSourceHome) !== path.resolve(legacyDefaultHome)
  ) {
    report.errors.push({
      step: "auth.preflight.source_guard",
      reason:
        "implicit auth repair source resolved to legacy ~/.openclaw; canonical source is required",
      canonicalSource: canonicalAuthSourceHome,
      resolvedSource: authSourceHome,
    });
  }

  const listBeforeCmd = runCommand(openclawBin, [
    "--profile",
    openclawProfile,
    "agents",
    "list",
    "--json",
  ]);
  if (listBeforeCmd.code !== 0) {
    report.errors.push({
      step: "agents.list.before",
      code: listBeforeCmd.code,
      stderr: listBeforeCmd.stderr,
    });
    throw new Error(`openclaw agents list failed (${listBeforeCmd.code})`);
  }

  const listBefore = parseJsonOutput(listBeforeCmd.stdout) || [];
  const existingIds = new Set((listBefore || []).map((row) => String(row.id || "").trim()));

  for (const roleAgent of ROLE_AGENTS) {
    if (existingIds.has(roleAgent.id)) {
      report.existingAgents.push(roleAgent.id);
      continue;
    }
    const addCmd = runCommand(openclawBin, [
      "--profile",
      openclawProfile,
      "agents",
      "add",
      roleAgent.id,
      "--workspace",
      sharedWorkspace,
      "--non-interactive",
      "--json",
    ]);
    if (addCmd.code !== 0) {
      report.errors.push({
        step: `agents.add.${roleAgent.id}`,
        code: addCmd.code,
        stderr: addCmd.stderr,
      });
      continue;
    }
    report.createdAgents.push(roleAgent.id);
  }

  const listAfterCmd = runCommand(openclawBin, [
    "--profile",
    openclawProfile,
    "agents",
    "list",
    "--json",
  ]);
  if (listAfterCmd.code !== 0) {
    report.errors.push({
      step: "agents.list.after",
      code: listAfterCmd.code,
      stderr: listAfterCmd.stderr,
    });
    throw new Error(`openclaw agents list (after) failed (${listAfterCmd.code})`);
  }

  const listAfter = parseJsonOutput(listAfterCmd.stdout) || [];
  const byId = new Map((listAfter || []).map((row) => [String(row.id || ""), row]));

  for (const roleAgent of ROLE_AGENTS) {
    const row = byId.get(roleAgent.id);
    if (!row) {
      report.missingAfterProvision.push(roleAgent.id);
      continue;
    }
    const fallbackAgentDir = path.join(openclawHome, "agents", roleAgent.id, "agent");
    const agentDir = String(row.agentDir || fallbackAgentDir);
    const stubPath = writeRoleStub(agentDir, roleAgent);
    report.roleStubs.push(stubPath);
  }

  if (dryRunEnabled) {
    for (const roleAgent of ROLE_AGENTS) {
      const probeCmd = runCommand(openclawBin, [
        "--profile",
        openclawProfile,
        "agent",
        "--agent",
        roleAgent.id,
        "--message",
        "Role preflight ping. Reply HEARTBEAT_OK.",
        "--json",
        "--timeout",
        "35",
      ]);
      if (probeCmd.code === 0) {
        report.dryRun.passed.push(roleAgent.id);
      } else {
        report.dryRun.failed.push({
          id: roleAgent.id,
          code: probeCmd.code,
          stderr: probeCmd.stderr,
        });
      }
    }
  }

  if (authPreflightEnabled) {
    const probeArgs = [
      "--profile",
      openclawProfile,
      "agent",
      "--agent",
      authProbeAgentId,
      "--message",
      "Auth preflight ping. Reply exactly: HEARTBEAT_OK",
      "--json",
      "--timeout",
      "35",
    ];
    const beforeProbe = runCommand(openclawBin, probeArgs);
    const beforeAuth = detectAuthError(beforeProbe);
    report.authPreflight.before = beforeAuth.reason || "ok";
    report.authPreflight.healthy = beforeProbe.code === 0 && !beforeAuth.matched;

    if (beforeAuth.matched && authAutoRepairEnabled) {
      report.authPreflight.attemptedRepair = true;
      const repairResult = ensureOpenaiCodexConfig({
        targetConfigPath: path.join(openclawHome, "openclaw.json"),
        sourceConfigPath: path.join(authSourceHome, "openclaw.json"),
      });
      report.authPreflight.repaired = repairResult.repaired;
      if (!repairResult.repaired) {
        report.errors.push({
          step: "auth.preflight.repair",
          reason: repairResult.reason,
        });
      }
      const afterProbe = runCommand(openclawBin, probeArgs);
      const afterAuth = detectAuthError(afterProbe);
      report.authPreflight.after = afterAuth.reason || "ok";
      report.authPreflight.healthy = afterProbe.code === 0 && !afterAuth.matched;
      if (!report.authPreflight.healthy) {
        report.errors.push({
          step: "auth.preflight.after",
          code: afterProbe.code,
          stderr: afterProbe.stderr,
          reason: afterAuth.reason || "auth preflight still failing",
        });
      }
    } else if (beforeAuth.matched) {
      report.errors.push({
        step: "auth.preflight.before",
        code: beforeProbe.code,
        stderr: beforeProbe.stderr,
        reason: beforeAuth.reason,
      });
    }
  }

  const reportPath = path.join(logsDir, "role-agent-provision.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (report.missingAfterProvision.length > 0) {
    throw new Error(
      `Missing required role agents after provision: ${report.missingAfterProvision.join(", ")}`
    );
  }
  if (report.errors.length > 0 && strictRoleRouting) {
    throw new Error("Role agent provisioning encountered errors under strict mode.");
  }
  if (dryRunEnabled && dryRunHardFail && report.dryRun.failed.length > 0) {
    throw new Error("Role agent dry-run failed under hard-fail policy.");
  }
}

main().catch((error) => {
  console.error("[provision-role-agents] failed", error?.message || error);
  process.exitCode = 1;
});
