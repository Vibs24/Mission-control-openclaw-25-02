import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    agentId: v.optional(v.id("agents")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("activities").order("desc");

    if (args.agentId) {
      const results = await ctx.db
        .query("activities")
        .withIndex("by_agent", (q) => q.eq("agentId", args.agentId!))
        .order("desc")
        .take(args.limit ?? 50);
      return results;
    }

    return await q.take(args.limit ?? 50);
  },
});

export const create = mutation({
  args: {
    type: v.union(
      v.literal("task_created"),
      v.literal("task_assigned"),
      v.literal("task_status_changed"),
      v.literal("message_sent"),
      v.literal("document_created"),
      v.literal("agent_started"),
      v.literal("agent_paused"),
      v.literal("heartbeat"),
      v.literal("task_triaged"),
      v.literal("task_review_requested"),
      v.literal("task_review_passed"),
      v.literal("task_review_failed"),
      v.literal("chief_followup_sent"),
      v.literal("telegram_intake_received"),
      v.literal("telegram_status_sent"),
      v.literal("automation_error")
    ),
    agentId: v.optional(v.id("agents")),
    agentName: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    taskTitle: v.optional(v.string()),
    message: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("activities", args);
  },
});
