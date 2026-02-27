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

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    return sortSteps(steps);
  },
});

export const currentByAgent = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("taskAgentSteps")
      .withIndex("by_agent_status", (q) => q.eq("agentId", args.agentId))
      .collect();
    return rows
      .filter((row) => workloadStatuses.has(String(row.status)))
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
    const all = await ctx.db.query("taskAgentSteps").collect();
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
      ctx.db
        .query("taskAgentSteps")
        .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
        .collect(),
      ctx.db.query("messages").withIndex("by_task", (q) => q.eq("taskId", args.taskId)).collect(),
    ]);
    const sorted = sortSteps(steps);
    const runningStep = sorted.find((s) => s.status === "running");
    const blockedStep = sorted.find((s) => s.status === "blocked" || s.status === "failed");
    const specialistSteps = sorted.filter((s) => s.role === "specialist");
    const specialistProofCount = specialistSteps.filter(
      (s) =>
        Boolean(s.proofSummary) ||
        (s.proofPaths?.length ?? 0) > 0 ||
        Boolean(s.proofMessageId) ||
        (s.proofDocumentIds?.length ?? 0) > 0
    ).length;
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

export const agentWorkloadSnapshot = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - 24 * 60 * 60 * 1000;
    const [agents, steps] = await Promise.all([ctx.db.query("agents").collect(), ctx.db.query("taskAgentSteps").collect()]);
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
      return {
        agentId: agent._id,
        runningCount: running.length,
        queuedCount: queued.length,
        stuckCount24h: stuck24h,
        currentTaskId: running[0]?.taskId,
        lastProofAt: lastProofAt || undefined,
      };
    });
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
    const existing = await ctx.db
      .query("taskAgentSteps")
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
        await ctx.db.insert("taskAgentSteps", {
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

    const finalSteps = await ctx.db
      .query("taskAgentSteps")
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
    const rows = await ctx.db
      .query("taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId))
      .collect();
    const target = rows.find((r) => Number(r.stepIndex) === Number(args.stepIndex));
    if (!target) return { ok: false, reason: "step_not_found" };
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
    const now = Date.now();
    await ctx.db.patch(target._id, {
      agentId: args.agentId,
      status: "running",
      startedAt: target.startedAt ?? now,
      lastProgressAt: now,
      stuckReason: undefined,
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
    const row = await ctx.db
      .query("taskAgentSteps")
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
    const row = await ctx.db
      .query("taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.taskId).eq("stepIndex", args.stepIndex))
      .unique();
    if (!row) return null;
    const now = Date.now();
    const nextPaths = uniqStrings([...(row.proofPaths ?? []), ...(args.proofPayload.paths ?? [])]);
    const nextDocs = uniqIds([...(row.proofDocumentIds ?? []), ...(args.proofPayload.proofDocumentIds ?? [])]);
    const nextRuns = uniqIds([...(row.dispatchRunIds ?? []), args.proofPayload.dispatchRunId]);
    await ctx.db.patch(row._id, {
      status: "waiting_handoff",
      lastProgressAt: now,
      proofSummary: args.proofPayload.summary ?? row.proofSummary,
      proofPaths: nextPaths,
      proofMessageId: args.proofPayload.proofMessageId ?? row.proofMessageId,
      proofDocumentIds: nextDocs as any,
      dispatchRunIds: nextRuns as any,
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
    const rows = await ctx.db
      .query("taskAgentSteps")
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
    const row = await ctx.db
      .query("taskAgentSteps")
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
    const row = await ctx.db
      .query("taskAgentSteps")
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
