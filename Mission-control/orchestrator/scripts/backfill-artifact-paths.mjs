import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

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

const env = {
  ...parseDotEnvFile(path.join(projectRoot, ".env.local")),
  ...parseDotEnvFile(path.join(orchestratorDir, ".env")),
  ...process.env,
};

const convexUrl = env.MISSION_CONTROL_CONVEX_URL || env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing MISSION_CONTROL_CONVEX_URL or VITE_CONVEX_URL");
}

const taskArtifactsRoot =
  env.TASK_ARTIFACTS_ROOT || path.join(workspaceRoot, "deliverables");

function slugifyTitle(value = "") {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deliverable"
  );
}

function defaultTaskArtifactRoot(task) {
  return path.join(
    taskArtifactsRoot,
    `${String(task?._id || "task")}-${slugifyTitle(task?.title || "")}`
  );
}

async function main() {
  fs.mkdirSync(taskArtifactsRoot, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const convex = new ConvexHttpClient(convexUrl);
  if (env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN) {
    convex.setAdminAuth(env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN);
  }

  const tasks = await convex.query(api.tasks.list, {});
  let updated = 0;
  let unchanged = 0;
  let degradedMutationFallback = false;

  for (const task of tasks || []) {
    const fallbackRoot = defaultTaskArtifactRoot(task);
    let result = null;
    if (!degradedMutationFallback) {
      try {
        result = await convex.mutation((api).tasks.backfillArtifactRootPath, {
          id: task._id,
        });
      } catch (error) {
        const message = String(error?.message || error || "");
        if (/Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(message)) {
          degradedMutationFallback = true;
          console.warn(
            "[backfill-artifact-paths] backfillArtifactRootPath unavailable on deployment; using local folder provisioning only"
          );
        } else {
          throw error;
        }
      }
    }
    const artifactRootPath = String(result?.artifactRootPath || fallbackRoot);
    fs.mkdirSync(artifactRootPath, { recursive: true });
    if (result?.updated) {
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const summary = {
    at: new Date().toISOString(),
    total: tasks?.length ?? 0,
    updated,
    unchanged,
    degradedMutationFallback,
    taskArtifactsRoot,
  };
  fs.writeFileSync(
    path.join(logsDir, "backfill-artifact-paths.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[backfill-artifact-paths] failed", error);
  process.exitCode = 1;
});
