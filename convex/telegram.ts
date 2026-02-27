import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const parseMode = v.union(v.literal("task"), v.literal("ignored"), v.literal("command"));
const receiveMode = v.union(v.literal("webhook"), v.literal("poller"));

function deriveTitle(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "Untitled Telegram Task";
  const normalized = trimmed.replace(/^\/task\s+/i, "").trim();
  const title = normalized.split(/\n+/)[0].slice(0, 80);
  return title || "Untitled Telegram Task";
}

function derivePriority(text: string): "urgent" | "high" | "normal" | "low" {
  const lower = text.toLowerCase();
  if (/(urgent|critical|sev1|incident|asap)/.test(lower)) return "urgent";
  if (/(high|today|important|blocking)/.test(lower)) return "high";
  if (/(low|nice to have|later)/.test(lower)) return "low";
  return "normal";
}

export const ingestTelegramUpdate = mutation({
  args: {
    updateId: v.number(),
    chatId: v.string(),
    userId: v.string(),
    messageId: v.number(),
    text: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    receivedVia: receiveMode,
    parsedAs: parseMode,
    createTask: v.boolean(),
    chiefAgentName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramIntakeEvents")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .take(1);
    if (existing[0]) {
      return { deduped: true, taskId: existing[0].taskId ?? null, eventId: existing[0]._id };
    }

    let taskId: any = undefined;
    let parsedAs = args.parsedAs;
    let error: string | undefined;

    if (args.createTask) {
      try {
        const agents = await ctx.db.query("agents").collect();
        const jarvis = agents.find((a) => a.name === "Jarvis");
        const reviewer = agents.find((a) => a.name === "Reviewer");

        taskId = await ctx.db.insert("tasks", {
          title: deriveTitle(args.text),
          description:
            `## Telegram Intake\n\n${args.text}\n\n` +
            `- Source: Telegram\n` +
            `- Chat ID: ${args.chatId}\n` +
            `- User: ${args.displayName ?? args.username ?? args.userId}\n`,
          status: "inbox",
          priority: derivePriority(args.text),
          labels: ["telegram-intake"],
          assigneeIds: [],
          commentCount: 0,
          attachmentCount: 0,
          source: "telegram",
          sourceRef: {
            chatId: args.chatId,
            messageId: args.messageId,
            updateId: args.updateId,
            username: args.username,
            displayName: args.displayName,
          },
          requesterName: args.displayName ?? args.username,
          requesterTelegramUserId: args.userId,
          intakeText: args.text,
          chiefAgentId: jarvis?._id,
          reviewerAgentId: reviewer?._id,
          reviewRequired: true,
          reviewStatus: "pending",
          acceptanceCriteria: [],
          staleAfterMinutes: 30,
          escalationLevel: 0,
          automationState: "new",
          nextAction: "Chief triage pending",
          nextCheckAt: Date.now() + 5 * 60 * 1000,
          lastChiefCheckAt: Date.now(),
          lastAssigneeUpdateAt: Date.now(),
        });

        await ctx.db.insert("activities", {
          type: "telegram_intake_received",
          agentName: args.chiefAgentName ?? "System",
          taskId,
          taskTitle: deriveTitle(args.text),
          message: `Telegram intake received and task created from ${args.displayName ?? args.username ?? args.userId}`,
          metadata: {
            chatId: args.chatId,
            messageId: args.messageId,
            updateId: args.updateId,
          },
        });

        parsedAs = "task";
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }

    const eventId = await ctx.db.insert("telegramIntakeEvents", {
      updateId: args.updateId,
      chatId: args.chatId,
      userId: args.userId,
      messageId: args.messageId,
      text: args.text,
      receivedVia: args.receivedVia,
      parsedAs,
      taskId,
      processedAt: Date.now(),
      error,
    });

    return { deduped: false, taskId: taskId ?? null, eventId, error: error ?? null };
  },
});

export const getTaskBySourceRef = query({
  args: {
    chatId: v.string(),
    messageId: v.optional(v.number()),
    updateId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_source", (q) => q.eq("source", "telegram"))
      .collect();
    return (
      tasks.find(
        (t) =>
          t.sourceRef?.chatId === args.chatId &&
          (args.messageId === undefined || t.sourceRef?.messageId === args.messageId) &&
          (args.updateId === undefined || t.sourceRef?.updateId === args.updateId)
      ) ?? null
    );
  },
});

export const logTelegramStatusSent = mutation({
  args: {
    taskId: v.id("tasks"),
    channel: v.optional(v.string()),
    target: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.insert("activities", {
      type: "telegram_status_sent",
      taskId: args.taskId,
      taskTitle: task.title,
      message: `Telegram status sent to ${args.target}: ${args.summary}`,
      metadata: { channel: args.channel ?? "telegram" },
    });
    return true;
  },
});
