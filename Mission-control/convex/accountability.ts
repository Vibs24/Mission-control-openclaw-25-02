// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const roleValidator = v.union(
  v.literal("chief"),
  v.literal("specialist"),
  v.literal("reviewer")
);

const stepStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting_handoff"),
  v.literal("handed_off"),
  v.literal("blocked"),
  v.literal("skipped"),
  v.literal("failed"),
  v.literal("completed")
);

const requiredProofValidator = v.union(
  v.literal("comment_summary"),
  v.literal("output_path"),
  v.literal("document"),
  v.literal("none")
);
const DEFAULT_ARTIFACTS_ROOT =
  "/Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables";

const workloadStatuses = new Set(["running", "queued", "waiting_handoff"]);

function uniqStrings(values: string[] = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function uniqIds(values: any[] = []) {
  return [...new Set(values.filter(Boolean).map((v) => String(v)))];
}

function sortSteps(steps: any[]) {
  return [...steps].sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0));
}

function slugifyTitle(value: string) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deliverable"
  );
}

function deriveArtifactRootPath(task: any) {
  const stored = String(task?.artifactRootPath || "").trim();
  if (stored.startsWith("/")) return stored;
  const taskId = String(task?._id || "").trim();
  if (!taskId) return null;
  return `${DEFAULT_ARTIFACTS_ROOT}/${taskId}-${slugifyTitle(String(task?.title || ""))}`;
}

function hasStepProof(step: any) {
  const hasSummary =
    Boolean(step?.proofSummary) ||
    Boolean(step?.proofMessageId) ||
    (step?.proofDocumentIds?.length ?? 0) > 0;
  const hasPath = (step?.proofPaths?.length ?? 0) > 0;
  const hasDocument = (step?.proofDocumentIds?.length ?? 0) > 0;
  const required = String(step?.requiredProof || "comment_summary");
  if (required === "none") return true;
  if (required === "output_path") return hasPath;
  if (required === "document") return hasDocument;
  return hasSummary;
}

function queryTable(ctx: any, table: string) {
  return (ctx.db.query as any)(table);
}

function insertTable(ctx: any, table: string, value: any) {
  return (ctx.db.insert as any)(table, value);
}

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const steps = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    return sortSteps(steps);
  },
});

export const currentByAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const rows = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_agent_status", (q) => q.eq("agentId", args.agentId))
      .collect();
    const taskIds = uniqIds(rows.map((row) => row.taskId));
    const tasksById = new Map<string, any>();
    for (const id of taskIds) {
      tasksById.set(String(id), await ctx.db.get(id as any));
    }
    return rows
      .filter((row) => workloadStatuses.has(String(row.status)))
      .filter((row) => {
        const task = tasksById.get(String(row.taskId));
        return Boolean(task) && String(task?.status || "") !== "done";
      })
      .sort((a, b) => {
        const aRank = a.status === "running" ? 0 : 1;
        const bRank = b.status === "running" ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;
        return Number(a.startedAt ?? a._creationTime ?? 0) - Number(b.startedAt ?? b._creationTime ?? 0);
      });
  },
});

export const stuckTasks = query({
  args: {
    now: v.optional(v.number()),
    staleMinutes: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Number(args.now ?? Date.now());
    const staleMs = Math.max(1, Number(args.staleMinutes ?? 10)) * 60 * 1000;
    const all = await queryTable(ctx, "taskAgentSteps").collect();
    const stuck = all
      .filter((step) => step.status === "running")
      .filter((step) => {
        const last = Number(step.lastProgressAt ?? step.startedAt ?? step._creationTime ?? 0);
        return now - last >= staleMs;
      })
      .sort((a, b) => {
        const aLast = Number(a.lastProgressAt ?? a.startedAt ?? a._creationTime ?? 0);
        const bLast = Number(b.lastProgressAt ?? b.startedAt ?? b._creationTime ?? 0);
        return aLast - bLast;
      })
      .slice(0, Math.max(1, Number(args.limit ?? 30)));

    const tasksById = new Map();
    for (const step of stuck) {
      const key = String(step.taskId);
      if (!tasksById.has(key)) {
        tasksById.set(key, await ctx.db.get(step.taskId));
      }
    }

    return stuck.map((step) => {
      const task = tasksById.get(String(step.taskId));
      const last = Number(step.lastProgressAt ?? step.startedAt ?? step._creationTime ?? 0);
      return {
        step,
        task,
        staleForMs: now - last,
      };
    });
  },
});

export const taskHealth = query({
  args: { taskId: v.id("tasks"), now: v.optional(v.number()), staleMinutes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Number(args.now ?? Date.now());
    const staleMs = Math.max(1, Number(args.staleMinutes ?? 10)) * 60 * 1000;
    const [task, steps, messages] = await Promise.all([
      ctx.db.get(args.taskId),
      queryTable(ctx, "taskAgentSteps")
        .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
        .collect(),
      ctx.db.query("messages").withIndex("by_task", (q) => q.eq("taskId", args.taskId)).collect(),
    ]);
    const sorted = sortSteps(steps);
    const runningStep = sorted.find((s) => s.status === "running");
    const blockedStep = sorted.find((s) => s.status === "blocked" || s.status === "failed");
    const specialistSteps = sorted.filter((s) => s.role === "specialist");
    const specialistProofCount = specialistSteps.filter((s) => {
      if (s.requiredProof === "output_path") {
        return (s.proofPaths?.length ?? 0) > 0;
      }
      return (
        Boolean(s.proofSummary) ||
        Boolean(s.proofMessageId) ||
        (s.proofDocumentIds?.length ?? 0) > 0
      );
    }).length;
    const chiefName = String(task?.chiefAgentId ? "" : "jarvis").toLowerCase();
    const chiefOnlyRisk =
      specialistProofCount === 0 &&
      (messages ?? []).some((m) => String(m.fromName || "").toLowerCase().includes(chiefName));
    const stale =
      runningStep &&
      now - Number(runningStep.lastProgressAt ?? runningStep.startedAt ?? runningStep._creationTime ?? 0) >= staleMs;
    const lastProofAt = sorted.reduce((acc, step) => {
      const hasProof =
        Boolean(step.proofSummary) ||
        (step.proofPaths?.length ?? 0) > 0 ||
        Boolean(step.proofMessageId) ||
        (step.proofDocumentIds?.length ?? 0) > 0;
      if (!hasProof) return acc;
      const ts = Number(step.lastProgressAt ?? step.startedAt ?? 0);
      return Math.max(acc, ts);
    }, 0);
    return {
      task,
      steps: sorted,
      runningStep,
      blockedStep,
      specialistProofCount,
      chiefOnlyRisk,
      stale: Boolean(stale),
      staleForMs: stale
        ? now - Number(runningStep?.lastProgressAt ?? runningStep?.startedAt ?? runningStep?._creationTime ?? 0)
        : 0,
      handoffValidCount: sorted.filter((s) => s.handoffValid === true).length,
      handoffInvalidCount: sorted.filter((s) => s.handoffValid === false).length,
      lastProofAt: lastProofAt || undefined,
    };
  },
});

export const workflowHealthByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const [task, steps] = await Promise.all([
      ctx.db.get(args.taskId),
      queryTable(ctx, "taskAgentSteps")
        .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
        .collect(),
    ]);
    const sorted = sortSteps(steps);
    const running = sorted.find((step) => step.status === "running");
    const blocked = sorted.find((step) => step.status === "blocked" || step.status === "failed");
    const waitingHandoff = sorted.find((step) => step.status === "waiting_handoff");
    const current =
      running ||
      blocked ||
      waitingHandoff ||
      sorted.find((step) => step.status === "queued") ||
      sorted[0] ||
      null;
    const missingFields = [];
    const artifactRootPath = deriveArtifactRootPath(task);
    const autoManagedArtifacts =
      String(task?.artifactPolicy || "auto_managed") === "auto_managed";
    const awaitingArtifactsInAutoFolder =
      Boolean(current) &&
      autoManagedArtifacts &&
      String(current?.status || "") === "running" &&
      String(current?.requiredProof || "") === "output_path" &&
      (current?.proofPaths?.length ?? 0) === 0;
    if (current) {
      const hasSummary =
        Boolean(current.proofSummary) ||
        Boolean(current.proofMessageId) ||
        (current.proofDocumentIds?.length ?? 0) > 0;
      const hasPath = (current.proofPaths?.length ?? 0) > 0;
      const hasArtifactVerification = Number(task?.artifactLastVerifiedAt ?? 0) > 0;
      const stuckReason = String(current.stuckReason || "").toLowerCase();
      if (current.requiredProof === "comment_summary" && !hasSummary) {
        missingFields.push("Structured summary");
      }
      if (current.requiredProof === "output_path") {
        if (autoManagedArtifacts) {
          const hasAutoManagedProof = hasPath || hasArtifactVerification;
          if (!hasAutoManagedProof) {
            if (String(current?.status || "") === "running") {
              // Running steps should not be marked as missing proof while execution is still active.
            } else if (awaitingArtifactsInAutoFolder) {
              // Running state for auto-managed artifact folders should not appear as proof failure yet.
            } else if (stuckReason.startsWith("agent_unavailable")) {
              // Busy-assignee wait state is not a proof-content failure.
            } else if (stuckReason.startsWith("invalid_worklog_schema")) {
              missingFields.push("Structured summary");
            } else if (stuckReason.startsWith("artifact_path_not_found")) {
              missingFields.push("Artifact folder path is missing on disk");
            } else if (stuckReason.startsWith("artifact_folder_empty")) {
              missingFields.push("Artifact folder has no verifiable deliverable files");
            } else if (
              stuckReason.startsWith("missing_output_path") ||
              stuckReason.startsWith("output_path_not_found") ||
              stuckReason.startsWith("output_path_empty") ||
              stuckReason.startsWith("no_verifiable_file_evidence")
            ) {
              missingFields.push("Artifact folder has no verifiable deliverable files");
            } else {
              missingFields.push("Artifact folder deliverables");
            }
          }
        } else if (!hasPath) {
          if (String(current?.status || "") === "running") {
            // Running steps should not be marked as missing proof while execution is still active.
          } else if (stuckReason.startsWith("agent_unavailable")) {
            // Busy-assignee wait state is not a proof-content failure.
          } else if (stuckReason.startsWith("output_path_not_found")) {
            missingFields.push("Output Path was provided but path does not exist on disk");
          } else if (stuckReason.startsWith("output_path_empty")) {
            missingFields.push("Output Path exists but has no verifiable deliverable files");
          } else {
            missingFields.push("Output Path or Stored Location");
          }
        }
      }
      if (current.requiredProof === "document" && (current.proofDocumentIds?.length ?? 0) === 0) {
        missingFields.push("Attached document evidence");
      }
    }
    return {
      taskId: args.taskId,
      workflowKind: task?.workflowKind ?? "general",
      workflowVersion: task?.workflowVersion ?? 1,
      currentStepIndex: current ? Number(current.stepIndex) : null,
      currentAgentName: current?.agentName ?? null,
      currentStatus: current?.status ?? null,
      nextRequiredProof: current?.requiredProof ?? null,
      missingFields,
      stale: Boolean(running && Date.now() - Number(running.lastProgressAt ?? running.startedAt ?? running._creationTime ?? 0) >= 10 * 60 * 1000),
      artifactRootPath,
      awaitingArtifactsInAutoFolder,
    };
  },
});

export const proofComplianceByAgent = query({
  args: {
    windowHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = Math.max(1, Number(args.windowHours ?? 24)) * 60 * 60 * 1000;
    const since = now - windowMs;
    const [agents, steps] = await Promise.all([ctx.db.query("agents").collect(), queryTable(ctx, "taskAgentSteps").collect()]);

    const inWindow = steps.filter((step) => {
      const at = Number(step.lastProgressAt ?? step.completedAt ?? step.startedAt ?? step._creationTime ?? 0);
      return at >= since;
    });

    const byAgent = new Map();
    for (const agent of agents) {
      byAgent.set(String(agent._id), {
        agentId: agent._id,
        totalProofChecks: 0,
        passedProofChecks: 0,
        complianceRate: 1,
        lastProofAt: undefined,
      });
    }

    for (const step of inWindow) {
      if (step.role === "chief") continue;
      const key = String(step.agentId);
      if (!byAgent.has(key)) continue;
      const row = byAgent.get(key);
      const requiresProof = step.requiredProof !== "none";
      if (!requiresProof) continue;
      row.totalProofChecks += 1;
      const hasProof =
        step.requiredProof === "output_path"
          ? (step.proofPaths?.length ?? 0) > 0
          : step.requiredProof === "document"
            ? (step.proofDocumentIds?.length ?? 0) > 0
            : Boolean(step.proofSummary) ||
              Boolean(step.proofMessageId) ||
              (step.proofDocumentIds?.length ?? 0) > 0;
      if (hasProof) row.passedProofChecks += 1;
      if (hasProof) {
        const at = Number(step.lastProgressAt ?? step.completedAt ?? step.startedAt ?? step._creationTime ?? 0);
        row.lastProofAt = Math.max(Number(row.lastProofAt || 0), at);
      }
    }

    return [...byAgent.values()].map((row) => ({
      ...row,
      complianceRate:
        row.totalProofChecks > 0
          ? Number((row.passedProofChecks / row.totalProofChecks).toFixed(4))
          : 1,
      lastProofAt: row.lastProofAt || undefined,
    }));
  },
});

export const agentWorkloadSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    const [agents, steps, messages] = await Promise.all([
      ctx.db.query("agents").collect(),
      queryTable(ctx, "taskAgentSteps").collect(),
      ctx.db.query("messages").collect(),
    ]);
    const structuredWorklogs = (messages || []).filter((msg) => {
      if (msg.kind === "worklog") return true;
      return /^\s*###\s*Worklog\s*—/im.test(String(msg.content || ""));
    });
    return agents.map((agent) => {
      const mine = steps.filter((s) => String(s.agentId) === String(agent._id));
      const running = mine.filter((s) => s.status === "running");
      const queued = mine.filter((s) => s.status === "queued" || s.status === "waiting_handoff");
      const stuck24h = mine.filter((s) => {
        if (!(s.status === "blocked" || s.status === "failed")) return false;
        const at = Number(s.lastProgressAt ?? s.completedAt ?? s._creationTime ?? 0);
        return at >= since;
      }).length;
      const lastProofAt = mine.reduce((acc, step) => {
        const hasProof =
          Boolean(step.proofSummary) ||
          (step.proofPaths?.length ?? 0) > 0 ||
          Boolean(step.proofMessageId) ||
          (step.proofDocumentIds?.length ?? 0) > 0;
        if (!hasProof) return acc;
        const at = Number(step.lastProgressAt ?? step.startedAt ?? 0);
        return Math.max(acc, at);
      }, 0);
      const lowerAgentName = String(agent.name || "").toLowerCase();
      const lastStructuredWorklogAt = structuredWorklogs.reduce((acc, msg) => {
        const fromAgentId = String(msg?.fromAgentId || "");
        const fromName = String(msg?.fromName || "").toLowerCase();
        const matchesAgent =
          (fromAgentId && fromAgentId === String(agent._id)) ||
          (fromName && fromName === lowerAgentName);
        if (!matchesAgent) return acc;
        return Math.max(acc, Number(msg?._creationTime || 0));
      }, 0);
      return {
        agentId: agent._id,
        runningCount: running.length,
        queuedCount: queued.length,
        stuckCount24h: stuck24h,
        currentTaskId: running[0]?.taskId,
        lastProofAt: lastProofAt || undefined,
        lastStructuredWorklogAt: lastStructuredWorklogAt || undefined,
      };
    });
  },
});

export const queueSignals = query({
  args: {
    staleMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staleMs = Math.max(1, Number(args.staleMinutes ?? 10)) * 60 * 1000;
    const now = Date.now();
    const [tasks, steps] = await Promise.all([
      ctx.db.query("tasks").collect(),
      queryTable(ctx, "taskAgentSteps").collect(),
    ]);
    const taskMap = new Map(tasks.map((task) => [String(task._id), task]));
    const byTask = new Map();
    for (const step of steps) {
      const key = String(step.taskId);
      if (!byTask.has(key)) byTask.set(key, []);
      byTask.get(key).push(step);
    }

    const noSpecialistProofTaskIds = [];
    const handoffFailedTaskIds = [];
    const agentStuckTaskIds = [];

    for (const [taskId, list] of byTask.entries()) {
      const task = taskMap.get(taskId);
      if (!task || task.status === "done") continue;
      const specialistSteps = list.filter((s) => s.role === "specialist");
      const specialistProofCount = specialistSteps.filter((s) => {
        if (s.requiredProof === "output_path") {
          return (s.proofPaths?.length ?? 0) > 0;
        }
        return (
          Boolean(s.proofSummary) ||
          Boolean(s.proofMessageId) ||
          (s.proofDocumentIds?.length ?? 0) > 0
        );
      }).length;
      if (specialistSteps.length > 0 && specialistProofCount === 0) {
        noSpecialistProofTaskIds.push(list[0]?.taskId ?? task._id);
      }
      if (list.some((s) => s.handoffValid === false || s.status === "failed")) {
        handoffFailedTaskIds.push(list[0]?.taskId ?? task._id);
      }
      const staleRunning = list.some((s) => {
        if (s.status !== "running") return false;
        const last = Number(s.lastProgressAt ?? s.startedAt ?? s._creationTime ?? 0);
        return now - last >= staleMs;
      });
      if (staleRunning) {
        agentStuckTaskIds.push(list[0]?.taskId ?? task._id);
      }
    }

    return {
      noSpecialistProofTaskIds,
      handoffFailedTaskIds,
      agentStuckTaskIds,
    };
  },
});

export const initTaskWorkflow = mutation({
  args: {
    taskId: v.id("tasks"),
    steps: v.array(
      v.object({
        stepIndex: v.number(),
        agentId: v.id("agents"),
        agentName: v.optional(v.string()),
        role: roleValidator,
        requiredProof: v.optional(requiredProofValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    const byIndex = new Map(existing.map((s) => [Number(s.stepIndex), s]));
    const incomingIndexes = new Set(args.steps.map((s) => Number(s.stepIndex)));
    let inserted = 0;
    let updated = 0;

    for (const step of args.steps) {
      const idx = Number(step.stepIndex);
      const current = byIndex.get(idx);
      const patch = {
        agentId: step.agentId,
        agentName: step.agentName ?? current?.agentName ?? "Agent",
        role: step.role,
        requiredProof: step.requiredProof ?? current?.requiredProof ?? "comment_summary",
      };
      if (!current) {
        await insertTable(ctx, "taskAgentSteps", {
          taskId: args.taskId,
          stepIndex: idx,
          ...patch,
          status: "queued",
          escalationCount: 0,
          dispatchRunIds: [],
          proofPaths: [],
          proofDocumentIds: [],
        });
        inserted += 1;
      } else {
        await ctx.db.patch(current._id, patch);
        updated += 1;
      }
    }

    for (const row of existing) {
      const idx = Number(row.stepIndex);
      if (incomingIndexes.has(idx)) continue;
      if (row.status === "queued") {
        await ctx.db.patch(row._id, {
          status: "skipped",
          completedAt: Date.now(),
          handoffValid: false,
          stuckReason: "Workflow reinitialized; step skipped.",
        });
      }
    }

    const finalSteps = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    return { inserted, updated, steps: sortSteps(finalSteps) };
  },
});

export const startStep = mutation({
  args: {
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const rows = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    const target = rows.find((r) => Number(r.stepIndex) === Number(args.stepIndex));
    if (!target) return { ok: false, reason: "step_not_found" };
    const alreadyRunningThisStep =
      target.status === "running" && String(target.agentId) === String(args.agentId);
    if (alreadyRunningThisStep) {
      return {
        ok: true,
        stepId: target._id,
        stepIndex: Number(target.stepIndex),
        alreadyRunning: true,
      };
    }
    const running = rows.find(
      (r) => r.status === "running" && Number(r.stepIndex) !== Number(args.stepIndex)
    );
    if (running) {
      return {
        ok: false,
        reason: "another_step_running",
        runningStepIndex: Number(running.stepIndex),
      };
    }
    const agentRunningElsewhere = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_agent_status", (q) => q.eq("agentId", args.agentId).eq("status", "running"))
      .collect();
    let conflicting: any = null;
    for (const row of agentRunningElsewhere) {
      const sameStep =
        String(row.taskId) === String(args.taskId) &&
        Number(row.stepIndex) === Number(args.stepIndex);
      if (sameStep) continue;
      const runningTask = await ctx.db.get(row.taskId as any);
      if (!runningTask || String(runningTask.status || "") === "done") {
        await ctx.db.patch(row._id, {
          status: "skipped",
          stuckReason: !runningTask
            ? "orphan_task_reference: task no longer exists"
            : "task_completed: stale running step was auto-closed",
          completedAt: Date.now(),
          lastProgressAt: Date.now(),
        });
        continue;
      }
      conflicting = row;
      break;
    }
    if (conflicting) {
      return {
        ok: false,
        reason: "agent_busy",
        runningTaskId: conflicting.taskId,
        runningStepIndex: Number(conflicting.stepIndex),
      };
    }
    const now = Date.now();
    await ctx.db.patch(target._id, {
      agentId: args.agentId,
      status: "running",
      startedAt: target.startedAt ?? now,
      lastProgressAt: now,
      stuckReason: undefined,
      completedAt: undefined,
      handoffAt: undefined,
      handoffBy: undefined,
      handoffToAgentId: undefined,
      handoffValid: undefined,
    });
    return {
      ok: true,
      stepId: target._id,
      stepIndex: Number(target.stepIndex),
    };
  },
});

export const attachDispatchRun = mutation({
  args: {
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    dispatchRunId: v.id("automationRuns"),
  },
  handler: async (ctx, args) => {
    const row = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId).eq("stepIndex", args.stepIndex))
      .unique();
    if (!row) return null;
    const next = uniqIds([...(row.dispatchRunIds ?? []), args.dispatchRunId]);
    await ctx.db.patch(row._id, { dispatchRunIds: next });
    return row._id;
  },
});

export const recordProof = mutation({
  args: {
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    proofPayload: v.object({
      summary: v.optional(v.string()),
      paths: v.optional(v.array(v.string())),
      proofMessageId: v.optional(v.id("messages")),
      proofDocumentIds: v.optional(v.array(v.id("documents"))),
      dispatchRunId: v.optional(v.id("automationRuns")),
    }),
  },
  handler: async (ctx, args) => {
    const row = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId).eq("stepIndex", args.stepIndex))
      .unique();
    if (!row) return null;
    const now = Date.now();
    const nextPaths = uniqStrings([...(row.proofPaths ?? []), ...(args.proofPayload.paths ?? [])]);
    const nextDocs = uniqIds([...(row.proofDocumentIds ?? []), ...(args.proofPayload.proofDocumentIds ?? [])]);
    const nextRuns = uniqIds([...(row.dispatchRunIds ?? []), args.proofPayload.dispatchRunId]);
    const nextSummary = args.proofPayload.summary ?? row.proofSummary;
    const nextProofMessageId = args.proofPayload.proofMessageId ?? row.proofMessageId;
    const candidate = {
      ...row,
      proofSummary: nextSummary,
      proofPaths: nextPaths,
      proofMessageId: nextProofMessageId,
      proofDocumentIds: nextDocs,
    };
    const proofSatisfied = hasStepProof(candidate);
    const isTerminal = row.status === "completed" || row.status === "handed_off" || row.status === "skipped";
    const nextStatus =
      row.status === "blocked" || row.status === "failed" || isTerminal
        ? row.status
        : proofSatisfied && row.requiredProof !== "output_path"
          ? "waiting_handoff"
          : "running";
    await ctx.db.patch(row._id, {
      status: nextStatus,
      lastProgressAt: now,
      proofSummary: nextSummary,
      proofPaths: nextPaths,
      proofMessageId: nextProofMessageId,
      proofDocumentIds: nextDocs as any,
      dispatchRunIds: nextRuns as any,
      stuckReason:
        row.status === "blocked" || row.status === "failed" || isTerminal
          ? row.stuckReason
          : proofSatisfied
            ? undefined
            : row.stuckReason,
    });
    return row._id;
  },
});

export const handoffStep = mutation({
  args: {
    taskId: v.id("tasks"),
    fromStepIndex: v.number(),
    toStepIndex: v.optional(v.number()),
    handoffBy: v.optional(v.string()),
    handoffValid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    const from = rows.find((r) => Number(r.stepIndex) === Number(args.fromStepIndex));
    if (!from) return { ok: false, reason: "from_step_not_found" };
    const to =
      args.toStepIndex === undefined
        ? null
        : rows.find((r) => Number(r.stepIndex) === Number(args.toStepIndex)) ?? null;
    const now = Date.now();

    await ctx.db.patch(from._id, {
      status: to ? "handed_off" : "completed",
      completedAt: now,
      handoffToAgentId: to?.agentId,
      handoffAt: now,
      handoffBy: args.handoffBy,
      handoffValid: args.handoffValid ?? true,
    });

    if (to) {
      await ctx.db.patch(to._id, {
        status: "running",
        startedAt: to.startedAt ?? now,
        lastProgressAt: now,
      });
    }

    return {
      ok: true,
      handedFrom: from._id,
      handedTo: to?._id,
    };
  },
});

export const blockStep = mutation({
  args: {
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    reason: v.string(),
    status: v.optional(v.union(v.literal("blocked"), v.literal("failed"))),
  },
  handler: async (ctx, args) => {
    const row = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId).eq("stepIndex", args.stepIndex))
      .unique();
    if (!row) return null;
    const nextEscalation = Number(row.escalationCount ?? 0) + 1;
    await ctx.db.patch(row._id, {
      status: args.status ?? "blocked",
      stuckReason: args.reason,
      escalationCount: nextEscalation,
      lastProgressAt: Date.now(),
      handoffValid: false,
    });
    return {
      stepId: row._id,
      escalationCount: nextEscalation,
    };
  },
});

export const completeStep = mutation({
  args: {
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await queryTable(ctx, "taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId).eq("stepIndex", args.stepIndex))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      status: "completed",
      completedAt: Date.now(),
      lastProgressAt: Date.now(),
      proofSummary: args.summary ?? row.proofSummary,
    });
    return row._id;
  },
});

export const cleanupOrphanSteps = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = Boolean(args.dryRun);
    const rows = await queryTable(ctx, "taskAgentSteps").collect();
    let orphanCount = 0;
    const orphanStepIds: string[] = [];
    for (const row of rows) {
      const task = await ctx.db.get(row.taskId as any);
      if (task) continue;
      orphanCount += 1;
      orphanStepIds.push(String(row._id));
      if (!dryRun) {
        await ctx.db.delete(row._id);
      }
    }
    return {
      ok: true,
      dryRun,
      orphanCount,
      deleted: dryRun ? 0 : orphanCount,
      orphanStepIds,
    };
  },
});
