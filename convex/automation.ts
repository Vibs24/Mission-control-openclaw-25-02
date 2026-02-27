import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const reviewStatusValidator = v.union(
  v.literal("not_required"),
  v.literal("pending"),
  v.literal("in_review"),
  v.literal("changes_requested"),
  v.literal("approved")
);

export const claimNextInboxTaskForChief = mutation({
  args: {
    chiefAgentId: v.id("agents"),
    chiefAgentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "inbox"))
      .collect();

    const candidate = tasks
      .filter((t) => !t.chiefAgentId || t.chiefAgentId === args.chiefAgentId)
      .sort((a, b) => a._creationTime - b._creationTime)[0];

    if (!candidate) return null;

    await ctx.db.patch(candidate._id, {
      chiefAgentId: args.chiefAgentId,
      automationState: "triage_pending",
      lastChiefCheckAt: Date.now(),
      nextCheckAt: Date.now() + 10 * 60 * 1000,
    });

    await ctx.db.insert("activities", {
      type: "task_triaged",
      agentId: args.chiefAgentId,
      agentName: args.chiefAgentName ?? "Jarvis",
      taskId: candidate._id,
      taskTitle: candidate.title,
      message: `${args.chiefAgentName ?? "Jarvis"} claimed inbox task for triage`,
    });

    return await ctx.db.get(candidate._id);
  },
});

export const setChiefTriageResult = mutation({
  args: {
    taskId: v.id("tasks"),
    chiefAgentId: v.id("agents"),
    chiefAgentName: v.string(),
    assigneeIds: v.array(v.id("agents")),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("normal"),
      v.literal("low")
    ),
    labels: v.optional(v.array(v.string())),
    acceptanceCriteria: v.array(v.string()),
    nextAction: v.string(),
    staleAfterMinutes: v.optional(v.number()),
    summaryComment: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const nextCheckMs = (args.staleAfterMinutes ?? task.staleAfterMinutes ?? 30) * 60 * 1000;
    const nextStatus = args.assigneeIds.length > 0 ? "assigned" : "inbox";

    await ctx.db.patch(args.taskId, {
      chiefAgentId: args.chiefAgentId,
      assigneeIds: args.assigneeIds,
      priority: args.priority,
      labels: args.labels ?? task.labels,
      acceptanceCriteria: args.acceptanceCriteria,
      nextAction: args.nextAction,
      staleAfterMinutes: args.staleAfterMinutes ?? task.staleAfterMinutes ?? 30,
      nextCheckAt: Date.now() + nextCheckMs,
      lastChiefCheckAt: Date.now(),
      status: nextStatus,
      automationState: args.assigneeIds.length > 0 ? "assigned" : "triage_pending",
      reviewRequired: true,
      reviewStatus: "pending",
    });

    await ctx.db.insert("messages", {
      taskId: args.taskId,
      fromAgentId: args.chiefAgentId,
      fromName: args.chiefAgentName,
      content: args.summaryComment,
      isSystemMessage: false,
    });

    await ctx.db.insert("activities", {
      type: "task_assigned",
      agentId: args.chiefAgentId,
      agentName: args.chiefAgentName,
      taskId: args.taskId,
      taskTitle: task.title,
      message: `${args.chiefAgentName} triaged and assigned '${task.title}'`,
      metadata: { assigneeCount: args.assigneeIds.length, nextAction: args.nextAction },
    });

    return await ctx.db.get(args.taskId);
  },
});

export const setTaskNextCheck = mutation({
  args: {
    taskId: v.id("tasks"),
    nextCheckAt: v.number(),
    nextAction: v.optional(v.string()),
    chiefAgentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      nextCheckAt: args.nextCheckAt,
      lastChiefCheckAt: Date.now(),
      chiefAgentId: args.chiefAgentId,
    };
    if (args.nextAction !== undefined) patch.nextAction = args.nextAction;
    await ctx.db.patch(args.taskId, patch);
  },
});

export const recordAssigneeHeartbeat = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.optional(v.id("agents")),
    agentName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    await ctx.db.patch(args.taskId, {
      lastAssigneeUpdateAt: Date.now(),
      nextCheckAt: Date.now() + (task.staleAfterMinutes ?? 30) * 60 * 1000,
    });

    if (args.note) {
      await ctx.db.insert("activities", {
        type: "heartbeat",
        agentId: args.agentId,
        agentName: args.agentName,
        taskId: args.taskId,
        taskTitle: task.title,
        message: args.note,
      });
    }

    return await ctx.db.get(args.taskId);
  },
});

export const markTaskEscalated = mutation({
  args: {
    taskId: v.id("tasks"),
    chiefAgentId: v.id("agents"),
    chiefAgentName: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const escalationLevel = (task.escalationLevel ?? 0) + 1;
    await ctx.db.patch(args.taskId, {
      escalationLevel,
      lastChiefCheckAt: Date.now(),
      nextCheckAt: Date.now() + 10 * 60 * 1000,
      automationState: "executing",
    });

    await ctx.db.insert("activities", {
      type: "chief_followup_sent",
      agentId: args.chiefAgentId,
      agentName: args.chiefAgentName,
      taskId: args.taskId,
      taskTitle: task.title,
      message: `${args.chiefAgentName} escalated follow-up for '${task.title}': ${args.reason}`,
      metadata: { escalationLevel },
    });

    return await ctx.db.get(args.taskId);
  },
});

export const submitForReview = mutation({
  args: {
    taskId: v.id("tasks"),
    reviewerAgentId: v.id("agents"),
    requesterAgentId: v.optional(v.id("agents")),
    requesterAgentName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    await ctx.db.patch(args.taskId, {
      status: "review",
      reviewerAgentId: args.reviewerAgentId,
      reviewRequired: true,
      reviewStatus: "in_review",
      automationState: "review_pending",
      nextAction: "Awaiting reviewer verification and decision",
      nextCheckAt: Date.now() + 10 * 60 * 1000,
      lastAssigneeUpdateAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      type: "task_review_requested",
      agentId: args.requesterAgentId,
      agentName: args.requesterAgentName,
      taskId: args.taskId,
      taskTitle: task.title,
      message: args.note ?? `Task '${task.title}' submitted for review`,
    });

    return await ctx.db.get(args.taskId);
  },
});

export const applyReviewDecision = mutation({
  args: {
    taskId: v.id("tasks"),
    reviewerAgentId: v.id("agents"),
    reviewerAgentName: v.string(),
    approved: v.boolean(),
    summary: v.string(),
    findings: v.array(v.string()),
    evidenceRefs: v.optional(v.array(v.string())),
    fallbackStatus: v.optional(v.union(v.literal("in_progress"), v.literal("blocked"), v.literal("waiting"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const nextStatus = args.approved ? "done" : (args.fallbackStatus ?? "in_progress");
    const reviewStatus = args.approved ? "approved" : "changes_requested";

    await ctx.db.insert("taskReviews", {
      taskId: args.taskId,
      reviewerAgentId: args.reviewerAgentId,
      status: args.approved ? "pass" : "fail",
      summary: args.summary,
      findings: args.findings,
      evidenceRefs: args.evidenceRefs,
      reviewedAt: Date.now(),
    });

    const patch: Record<string, any> = {
      status: nextStatus,
      reviewStatus,
      automationState: args.approved ? "completed" : "executing",
      lastChiefCheckAt: Date.now(),
      nextAction: args.approved
        ? "Completed and approved"
        : "Reviewer requested changes; assignee must address findings and repost evidence",
    };
    if (!args.approved) patch.nextCheckAt = Date.now() + 15 * 60 * 1000;
    await ctx.db.patch(args.taskId, patch);

    await ctx.db.insert("messages", {
      taskId: args.taskId,
      fromAgentId: args.reviewerAgentId,
      fromName: args.reviewerAgentName,
      content: args.summary + (args.findings.length ? `\n\nFindings:\n- ${args.findings.join("\n- ")}` : ""),
      isSystemMessage: false,
    });

    await ctx.db.insert("activities", {
      type: args.approved ? "task_review_passed" : "task_review_failed",
      agentId: args.reviewerAgentId,
      agentName: args.reviewerAgentName,
      taskId: args.taskId,
      taskTitle: task.title,
      message: `${args.reviewerAgentName} ${args.approved ? "approved" : "rejected"} review for '${task.title}'`,
    });

    return await ctx.db.get(args.taskId);
  },
});

export const reopenTaskAfterReview = mutation({
  args: {
    taskId: v.id("tasks"),
    chiefAgentId: v.optional(v.id("agents")),
    chiefAgentName: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    await ctx.db.patch(args.taskId, {
      status: "in_progress",
      reviewStatus: "changes_requested",
      automationState: "executing",
      lastChiefCheckAt: Date.now(),
      nextCheckAt: Date.now() + 15 * 60 * 1000,
    });

    await ctx.db.insert("activities", {
      type: "task_review_failed",
      agentId: args.chiefAgentId,
      agentName: args.chiefAgentName,
      taskId: args.taskId,
      taskTitle: task.title,
      message: `${args.chiefAgentName ?? "Jarvis"} reopened '${task.title}': ${args.reason}`,
    });

    return await ctx.db.get(args.taskId);
  },
});

export const listWatchdogCandidates = query({
  args: {
    now: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const all = await ctx.db.query("tasks").collect();
    return all
      .filter(
        (t) =>
          t.status !== "done" &&
          (t.nextCheckAt !== undefined && t.nextCheckAt <= now)
      )
      .sort((a, b) => (a.nextCheckAt ?? 0) - (b.nextCheckAt ?? 0))
      .slice(0, args.limit ?? 50);
  },
});

export const createAutomationRun = mutation({
  args: {
    taskId: v.id("tasks"),
    role: v.union(v.literal("chief"), v.literal("specialist"), v.literal("reviewer")),
    agentName: v.string(),
    dispatchType: v.union(
      v.literal("triage"),
      v.literal("execution"),
      v.literal("monitor"),
      v.literal("review")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("retrying")
    ),
    attempt: v.number(),
    inputSummary: v.optional(v.string()),
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("automationRuns", args);
  },
});

export const updateTaskAutomationState = mutation({
  args: {
    taskId: v.id("tasks"),
    automationState: v.union(
      v.literal("new"),
      v.literal("triage_pending"),
      v.literal("assigned"),
      v.literal("executing"),
      v.literal("review_pending"),
      v.literal("completed"),
      v.literal("errored")
    ),
    reviewStatus: v.optional(reviewStatusValidator),
    nextAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      automationState: args.automationState,
    };
    if (args.reviewStatus !== undefined) patch.reviewStatus = args.reviewStatus;
    if (args.nextAction !== undefined) patch.nextAction = args.nextAction;
    await ctx.db.patch(args.taskId, patch);
  },
});

export const listAutomationRunsByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("automationRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(20);
  },
});
