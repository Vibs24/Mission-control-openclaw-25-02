// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const nodeRoleValidator = v.union(
  v.literal("chief"),
  v.literal("project_manager"),
  v.literal("specialist"),
  v.literal("reviewer")
);

const nodeStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dependency_wait"),
  v.literal("runnable"),
  v.literal("running"),
  v.literal("waiting_handoff"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("completed"),
  v.literal("skipped")
);

const requiredProofValidator = v.union(
  v.literal("comment_summary"),
  v.literal("output_path"),
  v.literal("document"),
  v.literal("none")
);

const terminalStatuses = new Set(["completed", "skipped"]);
const blockedStatuses = new Set(["blocked", "failed"]);

function nowMs() {
  return Date.now();
}

function normalizeNodeKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "node";
}

function uniqStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function sortNodes(nodes = []) {
  return [...nodes].sort((a, b) => {
    const aCreated = Number(a.createdAt ?? a._creationTime ?? 0);
    const bCreated = Number(b.createdAt ?? b._creationTime ?? 0);
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.nodeKey || "").localeCompare(String(b.nodeKey || ""));
  });
}

function areDependenciesSatisfied(node, byKey) {
  const deps = uniqStrings(node.dependsOnNodeKeys || []);
  if (deps.length === 0) return true;
  for (const dep of deps) {
    const depNode = byKey.get(dep);
    if (!depNode) return false;
    const status = String(depNode.status || "");
    if (!terminalStatuses.has(status)) return false;
  }
  return true;
}

function hasProofForNode(node) {
  const required = String(node.requiredProof || "comment_summary");
  const hasSummary = Boolean(node.proofSummary) || Boolean(node.proofMessageId);
  const hasPaths = (node.proofPaths?.length ?? 0) > 0;
  const hasDocs = (node.proofDocumentIds?.length ?? 0) > 0;
  if (required === "none") return true;
  if (required === "output_path") return hasPaths;
  if (required === "document") return hasDocs;
  return hasSummary || hasPaths || hasDocs;
}

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    return sortNodes(nodes);
  },
});

export const currentByAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_agent_status", (q) => q.eq("agentId", args.agentId))
      .collect();
    return rows
      .filter((row) => ["running", "runnable", "queued", "dependency_wait", "waiting_handoff"].includes(String(row.status)))
      .sort((a, b) => Number(a.updatedAt ?? a._creationTime ?? 0) - Number(b.updatedAt ?? b._creationTime ?? 0));
  },
});

export const initGraph = mutation({
  args: {
    taskId: v.id("tasks"),
    graphVersion: v.optional(v.number()),
    nodes: v.array(
      v.object({
        nodeKey: v.string(),
        agentId: v.id("agents"),
        agentName: v.string(),
        role: nodeRoleValidator,
        dependsOnNodeKeys: v.optional(v.array(v.string())),
        requiredProof: v.optional(requiredProofValidator),
        status: v.optional(nodeStatusValidator),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    if (existing.length > 0) {
      await ctx.db.patch(args.taskId, {
        graphVersion: args.graphVersion ?? 1,
        graphReadyAt: nowMs(),
      });
      return { created: false, nodes: sortNodes(existing) };
    }

    const timestamp = nowMs();
    const normalizedNodes = (args.nodes || []).map((node) => {
      const nodeKey = normalizeNodeKey(node.nodeKey);
      const dependsOnNodeKeys = uniqStrings(node.dependsOnNodeKeys || []);
      const status =
        node.status ??
        (dependsOnNodeKeys.length > 0 ? "dependency_wait" : "runnable");
      return {
        taskId: args.taskId,
        nodeKey,
        agentId: node.agentId,
        agentName: node.agentName,
        role: node.role,
        status,
        dependsOnNodeKeys,
        requiredProof: node.requiredProof ?? "comment_summary",
        retryCount: 0,
        escalationCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });

    const insertedIds = [];
    for (const node of normalizedNodes) {
      const id = await ctx.db.insert("taskExecutionNodes", node);
      insertedIds.push(id);
    }

    await ctx.db.patch(args.taskId, {
      graphVersion: args.graphVersion ?? 1,
      graphReadyAt: timestamp,
    });

    const insertedNodes = [];
    for (const id of insertedIds) {
      const row = await ctx.db.get(id);
      if (row) insertedNodes.push(row);
    }
    return { created: true, nodes: sortNodes(insertedNodes) };
  },
});

export const recomputeRunnable = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    const sorted = sortNodes(nodes);
    const byKey = new Map(sorted.map((node) => [String(node.nodeKey), node]));
    const changed = [];
    for (const node of sorted) {
      const status = String(node.status || "");
      if (terminalStatuses.has(status) || blockedStatuses.has(status) || status === "running") {
        continue;
      }
      const depsReady = areDependenciesSatisfied(node, byKey);
      const nextStatus = depsReady ? "runnable" : "dependency_wait";
      if (nextStatus === status) continue;
      await ctx.db.patch(node._id, {
        status: nextStatus,
        updatedAt: nowMs(),
      });
      changed.push({ nodeKey: node.nodeKey, from: status, to: nextStatus });
      byKey.set(String(node.nodeKey), { ...node, status: nextStatus });
    }
    const refreshed = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    return {
      changed,
      nodes: sortNodes(refreshed),
    };
  },
});

export const startNode = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    if (String(node.agentId) !== String(args.agentId)) {
      return { ok: false, reason: "agent_mismatch" };
    }
    const status = String(node.status || "");
    if (terminalStatuses.has(status)) return { ok: false, reason: "already_completed" };
    if (blockedStatuses.has(status)) return { ok: false, reason: "node_blocked" };

    const taskNodes = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    const byKey = new Map(taskNodes.map((entry) => [String(entry.nodeKey), entry]));
    if (!areDependenciesSatisfied(node, byKey)) {
      await ctx.db.patch(node._id, {
        status: "dependency_wait",
        updatedAt: nowMs(),
      });
      return { ok: false, reason: "dependency_not_met" };
    }

    const runningForAgent = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_agent_status", (q) => q.eq("agentId", args.agentId).eq("status", "running"))
      .collect();
    const activeElsewhere = runningForAgent.find(
      (entry) => String(entry.taskId) !== String(args.taskId)
    );
    if (activeElsewhere) {
      return {
        ok: false,
        reason: "agent_busy",
        otherTaskId: activeElsewhere.taskId,
        otherNodeKey: activeElsewhere.nodeKey,
      };
    }

    const timestamp = nowMs();
    await ctx.db.patch(node._id, {
      status: "running",
      startedAt: Number(node.startedAt ?? timestamp),
      lastProgressAt: timestamp,
      updatedAt: timestamp,
      stuckReason: undefined,
    });
    return { ok: true, nodeId: node._id };
  },
});

export const recordNodeProof = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    proofPayload: v.object({
      summary: v.optional(v.string()),
      paths: v.optional(v.array(v.string())),
      proofMessageId: v.optional(v.id("messages")),
      proofDocumentIds: v.optional(v.array(v.id("documents"))),
      dispatchRunId: v.optional(v.id("automationRuns")),
      workDone: v.optional(v.string()),
      workingNow: v.optional(v.string()),
      nextSteps: v.optional(v.string()),
      blockers: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };

    const dispatchRunIds = uniqStrings([
      ...(node.dispatchRunIds || []),
      ...(args.proofPayload.dispatchRunId ? [args.proofPayload.dispatchRunId] : []),
    ]);
    const proofPaths = uniqStrings([...(node.proofPaths || []), ...(args.proofPayload.paths || [])]);
    const proofDocumentIds = uniqStrings([
      ...(node.proofDocumentIds || []),
      ...(args.proofPayload.proofDocumentIds || []),
    ]);
    const timestamp = nowMs();
    await ctx.db.patch(node._id, {
      proofSummary: args.proofPayload.summary ?? node.proofSummary,
      proofPaths,
      proofMessageId: args.proofPayload.proofMessageId ?? node.proofMessageId,
      proofDocumentIds,
      dispatchRunIds,
      workDone: args.proofPayload.workDone ?? node.workDone,
      workingNow: args.proofPayload.workingNow ?? node.workingNow,
      nextSteps: args.proofPayload.nextSteps ?? node.nextSteps,
      blockers: args.proofPayload.blockers ?? node.blockers,
      lastProgressAt: timestamp,
      updatedAt: timestamp,
      status: hasProofForNode({
        ...node,
        proofSummary: args.proofPayload.summary ?? node.proofSummary,
        proofPaths,
        proofDocumentIds,
      })
        ? "waiting_handoff"
        : node.status,
    });
    return { ok: true };
  },
});

export const completeNode = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    const timestamp = nowMs();
    await ctx.db.patch(node._id, {
      status: "completed",
      completedAt: timestamp,
      lastProgressAt: timestamp,
      updatedAt: timestamp,
      proofSummary: args.summary ?? node.proofSummary,
      stuckReason: undefined,
    });
    return { ok: true, nodeId: node._id };
  },
});

export const blockNode = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    reason: v.string(),
    status: v.optional(v.union(v.literal("blocked"), v.literal("failed"))),
    incrementEscalation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    const timestamp = nowMs();
    const currentEscalation = Number(node.escalationCount ?? 0);
    await ctx.db.patch(node._id, {
      status: args.status ?? "blocked",
      stuckReason: args.reason,
      escalationCount: args.incrementEscalation === false ? currentEscalation : currentEscalation + 1,
      lastProgressAt: timestamp,
      updatedAt: timestamp,
    });
    return { ok: true, nodeId: node._id };
  },
});

export const resetNodeForRetry = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    reason: v.optional(v.string()),
    incrementRetry: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    const timestamp = nowMs();
    const currentRetryCount = Number(node.retryCount ?? 0);
    const nextRetryCount = args.incrementRetry === false ? currentRetryCount : currentRetryCount + 1;
    await ctx.db.patch(node._id, {
      status: "runnable",
      stuckReason: args.reason,
      retryCount: nextRetryCount,
      updatedAt: timestamp,
      lastProgressAt: timestamp,
    });
    return { ok: true, nodeId: node._id };
  },
});

export const heartbeatNode = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    workingNow: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    if (String(node.status || "") !== "running") {
      return { ok: false, reason: "node_not_running" };
    }
    const timestamp = nowMs();
    await ctx.db.patch(node._id, {
      // Heartbeats are liveness pings, not implementation progress.
      // Keep progress-based watchdogs anchored to assignee work signals.
      updatedAt: timestamp,
      workingNow: args.workingNow ?? node.workingNow,
    });
    return { ok: true };
  },
});

export const reassignNodeAgent = mutation({
  args: {
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    newAgentId: v.id("agents"),
    newAgentName: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = normalizeNodeKey(args.nodeKey);
    const node = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_node", (q) => q.eq("taskId", args.taskId).eq("nodeKey", key))
      .first();
    if (!node) return { ok: false, reason: "node_not_found" };
    const timestamp = nowMs();
    await ctx.db.patch(node._id, {
      agentId: args.newAgentId,
      agentName: args.newAgentName,
      status: "runnable",
      stuckReason: args.reason ?? node.stuckReason,
      retryCount: Number(node.retryCount ?? 0) + 1,
      updatedAt: timestamp,
      lastProgressAt: timestamp,
    });
    return { ok: true, nodeId: node._id };
  },
});

export const taskGraphHealth = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const nodes = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    const sorted = sortNodes(nodes);
    const counts = {
      queued: 0,
      dependency_wait: 0,
      runnable: 0,
      running: 0,
      waiting_handoff: 0,
      blocked: 0,
      failed: 0,
      completed: 0,
      skipped: 0,
    };
    let proofReadyCount = 0;
    for (const node of sorted) {
      const status = String(node.status || "queued");
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
      if (hasProofForNode(node)) proofReadyCount += 1;
    }
    const runningNodes = sorted.filter((node) => String(node.status) === "running");
    const blockedNodes = sorted.filter((node) => blockedStatuses.has(String(node.status)));
    const unfinished = sorted.filter((node) => !terminalStatuses.has(String(node.status)));
    const deadlock =
      unfinished.length > 0 &&
      runningNodes.length === 0 &&
      counts.runnable === 0 &&
      counts.waiting_handoff === 0 &&
      blockedNodes.length === 0;

    return {
      taskId: args.taskId,
      totalNodes: sorted.length,
      counts,
      proofReadyCount,
      runningNodes,
      blockedNodes,
      deadlock,
      healthy: !deadlock && blockedNodes.length === 0,
      updatedAt: nowMs(),
    };
  },
});
