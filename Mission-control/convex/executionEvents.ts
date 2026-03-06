import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const roleValidator = v.union(
  v.literal("chief"),
  v.literal("project_manager"),
  v.literal("specialist"),
  v.literal("reviewer"),
  v.literal("system")
);

const kindValidator = v.union(
  v.literal("triage"),
  v.literal("dispatch"),
  v.literal("worklog"),
  v.literal("heartbeat"),
  v.literal("handoff"),
  v.literal("proof"),
  v.literal("review"),
  v.literal("recovery"),
  v.literal("system")
);

const severityValidator = v.union(
  v.literal("info"),
  v.literal("success"),
  v.literal("warning"),
  v.literal("error")
);

function normalizeLimit(value: number | undefined, fallback = 40) {
  return Math.max(1, Math.min(value ?? fallback, 200));
}

function withCursor(rows: any[], cursor: number | undefined) {
  if (!cursor || cursor <= 0) return rows;
  return rows.filter((row) => Number(row.createdAt ?? 0) < cursor);
}

function withFilters(rows: any[], args: any) {
  const actor = String(args.actorName || "").toLowerCase().trim();
  const kindSet = new Set((args.kinds ?? []).map((k: string) => String(k)));
  const severitySet = new Set((args.severities ?? []).map((k: string) => String(k)));
  return rows.filter((row) => {
    if (actor && String(row.actorName || "").toLowerCase() !== actor) return false;
    if (kindSet.size > 0 && !kindSet.has(String(row.kind || ""))) return false;
    if (severitySet.size > 0 && !severitySet.has(String(row.severity || ""))) return false;
    return true;
  });
}

function withAgentFilter(rows: any[], agentId: any) {
  if (!agentId) return rows;
  return rows.filter((row) => String(row.actorAgentId || "") === String(agentId));
}

export const create = mutation({
  args: {
    taskId: v.optional(v.id("tasks")),
    actorAgentId: v.optional(v.id("agents")),
    actorName: v.string(),
    actorRole: roleValidator,
    kind: kindValidator,
    severity: severityValidator,
    title: v.string(),
    summary: v.string(),
    workDone: v.optional(v.string()),
    workingNow: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    blockers: v.optional(v.string()),
    evidencePaths: v.optional(v.array(v.string())),
    detailsMarkdown: v.optional(v.string()),
    detailsJson: v.optional(v.any()),
    relatedMessageId: v.optional(v.id("messages")),
    relatedStepId: v.optional(v.id("taskAgentSteps")),
    relatedRunId: v.optional(v.id("automationRuns")),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("executionEvents", {
      ...args,
      createdAt: Number(args.createdAt ?? Date.now()),
    });
  },
});

export const get = query({
  args: { id: v.id("executionEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    agentId: v.optional(v.id("agents")),
    kinds: v.optional(v.array(kindValidator)),
    severities: v.optional(v.array(severityValidator)),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 50);
    const take = Math.min(500, Math.max(limit * 3, 120));
    const rows = args.agentId
      ? await ctx.db
          .query("executionEvents")
          .withIndex("by_actor_created", (q) => q.eq("actorAgentId", args.agentId!))
          .order("desc")
          .take(take)
      : await ctx.db.query("executionEvents").withIndex("by_created").order("desc").take(take);

    const filtered = withFilters(withCursor(withAgentFilter(rows, args.agentId), args.cursor), args);
    const events = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore ? Number(filtered[limit - 1]?.createdAt || 0) : undefined;
    return {
      events,
      hasMore,
      nextCursor,
    };
  },
});

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
    actorName: v.optional(v.string()),
    kinds: v.optional(v.array(kindValidator)),
    severities: v.optional(v.array(severityValidator)),
  },
  handler: async (ctx, args) => {
    const limit = normalizeLimit(args.limit, 80);
    const take = Math.min(500, Math.max(limit * 3, 120));
    const rows = await ctx.db
      .query("executionEvents")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(take);

    const filtered = withFilters(withCursor(rows, args.cursor), args);
    const events = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore ? Number(filtered[limit - 1]?.createdAt || 0) : undefined;

    return {
      events,
      hasMore,
      nextCursor,
    };
  },
});
