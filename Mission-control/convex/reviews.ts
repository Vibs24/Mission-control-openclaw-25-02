import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createReviewRecord = mutation({
  args: {
    taskId: v.id("tasks"),
    reviewerAgentId: v.id("agents"),
    status: v.union(v.literal("pass"), v.literal("fail")),
    summary: v.string(),
    findings: v.array(v.string()),
    evidenceRefs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("taskReviews", {
      ...args,
      reviewedAt: Date.now(),
    });
  },
});

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskReviews")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

export const latestByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("taskReviews")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});
