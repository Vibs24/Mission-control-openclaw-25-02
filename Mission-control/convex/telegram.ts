import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const parseMode = v.union(v.literal("task"), v.literal("ignored"), v.literal("command"));
const receiveMode = v.union(v.literal("webhook"), v.literal("poller"));
const workflowKindValidator = v.union(
  v.literal("general"),
  v.literal("review"),
  v.literal("debug"),
  v.literal("incident"),
  v.literal("architecture"),
  v.literal("standup"),
  v.literal("deploy_checklist")
);

const DEFAULT_ARTIFACTS_ROOT = "/Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables";

function slugifyTitle(value: string) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "deliverable"
  );
}

function buildArtifactRootPath(taskId: string, title: string) {
  return `${DEFAULT_ARTIFACTS_ROOT}/${taskId}-${slugifyTitle(title)}`;
}

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

function classifyWorkflowKind(text: string): "general" | "review" | "debug" | "incident" | "architecture" | "standup" | "deploy_checklist" {
  const lower = String(text || "").toLowerCase();
  if (/(incident|sev1|sev2|outage|production down|service down)/.test(lower)) return "incident";
  if (/(review|pull request|pr |diff|code quality)/.test(lower)) return "review";
  if (/(debug|error|bug|stack trace|500|failing)/.test(lower)) return "debug";
  if (/(architecture|adr|system design|trade-?off|scalability)/.test(lower)) return "architecture";
  if (/(standup|yesterday|today|blockers|daily update)/.test(lower)) return "standup";
  if (/(deploy|release|rollback|checklist|pre-?deploy|post-?deploy)/.test(lower)) return "deploy_checklist";
  return "general";
}

function workflowKindFromCommand(command?: string) {
  const normalized = String(command || "").trim().toLowerCase();
  if (normalized === "/review") return "review";
  if (normalized === "/debug") return "debug";
  if (normalized === "/incident") return "incident";
  if (normalized === "/architecture") return "architecture";
  if (normalized === "/standup") return "standup";
  if (normalized === "/deploy-checklist") return "deploy_checklist";
  return null;
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
    workflowCommand: v.optional(v.string()),
    workflowKind: v.optional(workflowKindValidator),
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
        const workflowKind =
          args.workflowKind ||
          workflowKindFromCommand(args.workflowCommand) ||
          classifyWorkflowKind(args.text);
        const workflowLabel = `workflow-${workflowKind.replace(/_/g, "-")}`;
        const labels = Array.from(new Set(["telegram-intake", workflowLabel]));
        const title = deriveTitle(args.text);

        taskId = await ctx.db.insert("tasks", {
          title,
          description:
            `## Telegram Intake\n\n${args.text}\n\n` +
            `- Source: Telegram\n` +
            `- Chat ID: ${args.chatId}\n` +
            `- User: ${args.displayName ?? args.username ?? args.userId}\n`,
          status: "inbox",
          priority: derivePriority(args.text),
          labels,
          assigneeIds: [],
          commentCount: 0,
          attachmentCount: 0,
          source: "telegram",
          workflowKind,
          workflowCommand: args.workflowCommand,
          workflowVersion: 1,
          orchestrationModel: "chief_pm_parallel",
          graphVersion: 1,
          artifactPolicy: "auto_managed",
          telegramDeliveryState: "ok",
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

        const artifactRootPath = buildArtifactRootPath(String(taskId), title);
        await ctx.db.patch(taskId, {
          artifactRootPath,
          artifactPolicy: "auto_managed",
        });

        await ctx.db.insert("activities", {
          type: "telegram_intake_received",
          agentName: args.chiefAgentName ?? "System",
          taskId,
          taskTitle: title,
          message:
            `Telegram intake received and task created from ${args.displayName ?? args.username ?? args.userId} ` +
            `(artifact root: ${artifactRootPath})`,
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

export const setTaskTelegramDeliveryState = mutation({
  args: {
    taskId: v.id("tasks"),
    state: v.union(
      v.literal("ok"),
      v.literal("disabled_chat"),
      v.literal("transient_failure"),
      v.literal("unknown")
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    await ctx.db.patch(args.taskId, {
      telegramDeliveryState: args.state,
    });
    await ctx.db.insert("activities", {
      type: "automation_error",
      taskId: args.taskId,
      taskTitle: task.title,
      message: `Telegram delivery state updated: ${args.state}${args.reason ? ` (${args.reason})` : ""}`,
      metadata: { reason: args.reason },
    });
    return true;
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

export const listRecentIntakeEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 200, 1000));
    return await ctx.db.query("telegramIntakeEvents").order("desc").take(limit);
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
