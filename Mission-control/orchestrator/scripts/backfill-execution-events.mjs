import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const orchestratorDir = path.resolve(__dirname, "..");
const projectRoot = path.resolve(orchestratorDir, "..");
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

const lookbackDays = Math.max(1, Number(env.EXECUTION_EVENTS_BACKFILL_DAYS || 7));
const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

function chunkText(value = "", max = 1200) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function fingerprintEvent(taskId, event = {}) {
  const createdAt = Number(event.createdAt || 0);
  const kind = String(event.kind || "");
  const actorName = String(event.actorName || "");
  const summary = String(event.summary || "");
  const title = String(event.title || "");
  const relMsg = String(event.relatedMessageId || "");
  const relStep = String(event.relatedStepId || "");
  const relRun = String(event.relatedRunId || "");
  return [
    String(taskId || ""),
    kind,
    actorName,
    createdAt,
    title,
    summary,
    relMsg,
    relStep,
    relRun,
  ].join("|");
}

async function listExistingTaskEvents(convex, taskId) {
  const all = [];
  let cursor = undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await convex.query((api).executionEvents.listByTask, {
      taskId,
      limit: 200,
      cursor,
    });
    const events = page?.events ?? [];
    all.push(...events);
    if (!page?.hasMore || !page?.nextCursor) break;
    cursor = Number(page.nextCursor);
  }
  return all;
}

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });

  const convex = new ConvexHttpClient(convexUrl);
  if (env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN) {
    convex.setAdminAuth(env.MISSION_CONTROL_CONVEX_ADMIN_TOKEN);
  }

  const tasks = await convex.query(api.tasks.list, {});
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let duplicateSkipped = 0;

  for (const task of tasks || []) {
    if (Number(task._creationTime || 0) < since) continue;

    const [messages, steps, runs, activities] = await Promise.all([
      convex.query((api).messages.listExecutionLogsByTask, { taskId: task._id, limit: 220 }),
      convex.query((api).accountability.listByTask, { taskId: task._id }),
      convex.query((api).automation.listAutomationRunsByTask, { taskId: task._id }),
      convex.query((api).activities.listByTask, { taskId: task._id, limit: 220 }),
    ]);

    const events = [];
    const existing = await listExistingTaskEvents(convex, task._id);
    const existingFingerprints = new Set(
      (existing || []).map((row) => fingerprintEvent(task._id, row))
    );

    for (const msg of messages || []) {
      events.push({
        taskId: task._id,
        actorAgentId: msg.fromAgentId,
        actorName: msg.fromName || "System",
        actorRole: String(msg.fromName || "").toLowerCase().includes("reviewer")
          ? "reviewer"
          : String(msg.fromName || "").toLowerCase().includes("jarvis")
            ? "chief"
            : "specialist",
        kind:
          msg.effectiveKind === "worklog"
            ? "worklog"
            : msg.effectiveKind === "handoff"
              ? "handoff"
              : msg.effectiveKind === "review"
                ? "review"
                : "system",
        severity: "info",
        title: "Backfilled message",
        summary: chunkText(msg.content, 220),
        workDone: chunkText(msg.content, 480),
        detailsMarkdown: chunkText(msg.content, 5000),
        relatedMessageId: msg._id,
        createdAt: Number(msg._creationTime || Date.now()),
      });
    }

    for (const step of steps || []) {
      const status = String(step.status || "");
      events.push({
        taskId: task._id,
        actorAgentId: step.agentId,
        actorName: step.agentName || "Agent",
        actorRole: step.role || "specialist",
        kind: "proof",
        severity:
          status === "completed" || status === "handed_off"
            ? "success"
            : status === "blocked" || status === "failed"
              ? "error"
              : status === "running"
                ? "warning"
                : "info",
        title: `Backfilled step #${step.stepIndex}`,
        summary: `Status ${status} | required proof: ${step.requiredProof}`,
        workDone: step.proofSummary ? chunkText(step.proofSummary, 300) : undefined,
        blockers: step.stuckReason ? chunkText(step.stuckReason, 300) : undefined,
        evidencePaths: step.proofPaths ?? [],
        relatedStepId: step._id,
        createdAt: Number(step.lastProgressAt || step._creationTime || Date.now()),
      });
    }

    for (const run of runs || []) {
      events.push({
        taskId: task._id,
        actorName: run.agentName || "Agent",
        actorRole: run.role === "reviewer" ? "reviewer" : run.role === "chief" ? "chief" : "specialist",
        kind: "dispatch",
        severity: run.status === "succeeded" ? "success" : run.status === "failed" ? "error" : "warning",
        title: `Backfilled ${run.dispatchType} run`,
        summary: `${run.dispatchType} ${run.status} (attempt ${run.attempt})`,
        workDone: run.outputSummary ? chunkText(run.outputSummary, 300) : undefined,
        blockers: run.error ? chunkText(run.error, 300) : undefined,
        relatedRunId: run._id,
        createdAt: Number(run.finishedAt || run.startedAt || run._creationTime || Date.now()),
      });
    }

    for (const activity of activities || []) {
      if (activity.type === "message_sent") continue;
      events.push({
        taskId: task._id,
        actorAgentId: activity.agentId,
        actorName: activity.agentName || "System",
        actorRole: String(activity.agentName || "").toLowerCase().includes("jarvis") ? "chief" : "system",
        kind: "system",
        severity: activity.type === "automation_error" ? "error" : "info",
        title: "Backfilled activity",
        summary: chunkText(activity.message, 260),
        detailsJson: activity.metadata || undefined,
        createdAt: Number(activity._creationTime || Date.now()),
      });
    }

    events.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

    for (const event of events) {
      const fp = fingerprintEvent(task._id, event);
      if (existingFingerprints.has(fp)) {
        duplicateSkipped += 1;
        continue;
      }
      try {
        await convex.mutation((api).executionEvents.create, event);
        created += 1;
        existingFingerprints.add(fp);
      } catch (error) {
        const message = String(error?.message || error || "");
        if (/Could not find public function|BadConvexFunctionIdentifier|not a valid path to a Convex function/i.test(message)) {
          skipped += 1;
          console.warn("[backfill-execution-events] executionEvents.create unavailable on deployment; stopping");
          break;
        }
        failed += 1;
      }
    }
  }

  const summary = {
    at: new Date().toISOString(),
    lookbackDays,
    created,
    duplicateSkipped,
    skipped,
    failed,
  };

  fs.writeFileSync(
    path.join(logsDir, "backfill-execution-events.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[backfill-execution-events] failed", error);
  process.exitCode = 1;
});
