import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
    delivered: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_agent", (q) => q.eq("mentionedAgentId", args.agentId))
      .order("desc")
      .take(20);

    if (args.delivered !== undefined) {
      return notifications.filter((n) => n.delivered === args.delivered);
    }
    return notifications;
  },
});

export const markDelivered = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { delivered: true });
  },
});

export const markAllDelivered = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const undelivered = await ctx.db
      .query("notifications")
      .withIndex("by_agent", (q) => q.eq("mentionedAgentId", args.agentId))
      .collect();

    for (const n of undelivered.filter((n) => !n.delivered)) {
      await ctx.db.patch(n._id, { delivered: true });
    }
  },
});
