import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function hasApprovedReview(ctx: any, taskId: any) {
  const reviews = await ctx.db
    .query("taskReviews")
    .withIndex("by_task", (q: any) => q.eq("taskId", taskId))
    .order("desc")
    .take(1);
  return reviews[0]?.status === "pass";
}

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("assigned"),
        v.literal("in_progress"),
        v.literal("review"),
        v.literal("waiting"),
        v.literal("blocked"),
        v.literal("done")
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("tasks").collect();
  },
});

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("normal"),
      v.literal("low")
    ),
    labels: v.array(v.string()),
    assigneeIds: v.array(v.id("agents")),
    creatorId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      ...args,
      source: "manual",
      status: args.assigneeIds.length > 0 ? "assigned" : "inbox",
      commentCount: 0,
      attachmentCount: 0,
      reviewRequired: true,
      reviewStatus: "pending",
      acceptanceCriteria: [],
      staleAfterMinutes: 30,
      escalationLevel: 0,
      automationState: args.assigneeIds.length > 0 ? "assigned" : "new",
      lastAssigneeUpdateAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      type: "task_created",
      agentId: args.creatorId,
      taskId,
      taskTitle: args.title,
      message: `New task created: ${args.title}`,
    });

    return taskId;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("waiting"),
      v.literal("blocked"),
      v.literal("done")
    ),
    agentId: v.optional(v.id("agents")),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return;

    if (args.status === "done" && task.reviewRequired) {
      const approved = await hasApprovedReview(ctx, args.id);
      if (!approved) {
        throw new Error(
          "Cannot move task to done without an approved reviewer record. Submit for review first."
        );
      }
    }

    const patch: Record<string, any> = {
      status: args.status,
      lastAssigneeUpdateAt: Date.now(),
    };
    if (args.status === "review") {
      patch.reviewStatus = "pending";
      patch.automationState = "review_pending";
      patch.nextCheckAt = Date.now() + 5 * 60 * 1000;
    } else if (args.status === "done") {
      patch.reviewStatus = task.reviewRequired ? "approved" : task.reviewStatus;
      patch.automationState = "completed";
    } else if (args.status === "in_progress") {
      patch.automationState = "executing";
    }

    await ctx.db.patch(args.id, patch);

    await ctx.db.insert("activities", {
      type: "task_status_changed",
      agentId: args.agentId,
      agentName: args.agentName,
      taskId: args.id,
      taskTitle: task.title,
      message: `${args.agentName ?? "System"} moved '${task.title}' to ${args.status}`,
      metadata: { from: task.status, to: args.status },
    });
  },
});

export const assign = mutation({
  args: {
    id: v.id("tasks"),
    assigneeIds: v.array(v.id("agents")),
    agentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return;

    await ctx.db.patch(args.id, {
      assigneeIds: args.assigneeIds,
      status: "assigned",
      automationState: "assigned",
      lastChiefCheckAt: Date.now(),
      nextCheckAt: Date.now() + 15 * 60 * 1000,
    });

    await ctx.db.insert("activities", {
      type: "task_assigned",
      taskId: args.id,
      taskTitle: task.title,
      message: `Task assigned: ${task.title}`,
    });
  },
});

export const archive = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return;

    if (task.reviewRequired) {
      const approved = await hasApprovedReview(ctx, args.id);
      if (!approved) {
        throw new Error(
          "Cannot archive/complete task without an approved reviewer record."
        );
      }
    }

    await ctx.db.patch(args.id, {
      status: "done",
      automationState: "completed",
      reviewStatus: task.reviewRequired ? "approved" : task.reviewStatus,
    });
  },
});
