import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    channel: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const channel = args.channel ?? "general";
    const limit = Math.max(1, Math.min(args.limit ?? 100, 300));
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .order("desc")
      .take(limit);
    return rows.reverse();
  },
});

export const send = mutation({
  args: {
    fromAgentId: v.optional(v.id("agents")),
    fromName: v.string(),
    fromEmoji: v.string(),
    content: v.string(),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content = args.content.trim();
    if (!content) {
      throw new Error("Chat message cannot be empty.");
    }
    if (content.length > 2000) {
      throw new Error("Chat message is too long (max 2000 characters).");
    }
    return await ctx.db.insert("chatMessages", {
      ...args,
      content,
      channel: args.channel ?? "general",
    });
  },
});

export const seedChat = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("chatMessages").collect();
    if (existing.length > 0) return { message: "Chat already seeded" };

    const messages = [
      {
        fromName: "Bruce",
        fromEmoji: "🖥️",
        content:
          "Heads up — API gateway latency is elevated. P99 sitting at 280ms for the last 20 min. Investigating.",
        channel: "general",
      },
      {
        fromName: "Natasha",
        fromEmoji: "🕷️",
        content:
          "Got 3 tickets about login failures in the last hour. All enterprise accounts. Correlating with the auth service deploy at 14:15 UTC.",
        channel: "general",
      },
      {
        fromName: "Jarvis",
        fromEmoji: "👑",
        content:
          "@Bruce can you pull the CloudWatch metrics for the last 2 hours? @Natasha please update the Known Issues runbook with the SSO issue pattern.",
        channel: "general",
      },
      {
        fromName: "Steve",
        fromEmoji: "🛡️",
        content:
          "Already updated the runbook. Issue #2. Workaround is to direct affected users to /logout?force=true. Fix is in next release.",
        channel: "general",
      },
      {
        fromName: "Bruce",
        fromEmoji: "🖥️",
        content:
          "Found it — ELB healthy host count dropped from 12 to 8 at 14:30. Two instances failed health checks. Scaling now.",
        channel: "general",
      },
      {
        fromName: "Peter",
        fromEmoji: "🌐",
        content:
          "I'll document this incident in the IT onboarding guide so new team members understand our response protocol.",
        channel: "general",
      },
    ];

    for (const msg of messages) {
      await ctx.db.insert("chatMessages", msg);
    }

    return { message: `Seeded ${messages.length} chat messages` };
  },
});
