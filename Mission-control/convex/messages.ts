import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

export const listExecutionLogsByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
    agentName: v.optional(v.string()),
    kind: v.optional(
      v.union(
        v.literal("note"),
        v.literal("worklog"),
        v.literal("handoff"),
        v.literal("review"),
        v.literal("system")
      )
    ),
    stepIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const classify = (row: any) => {
      if (row.kind) return row.kind;
      const fromName = String(row.fromName || "").toLowerCase();
      const content = String(row.content || "");
      if (/^\s*###\s*Worklog\s*—/im.test(content)) return "worklog";
      if (/handoff/i.test(content)) return "handoff";
      if (fromName.includes("reviewer") || /reviewer approved|reviewer requested changes/i.test(content)) {
        return "review";
      }
      if (fromName.includes("jarvis") || row.isSystemMessage) return "system";
      return "note";
    };

    const filtered = rows
      .map((row) => ({ ...row, effectiveKind: classify(row) }))
      .filter((row) => {
        if (args.agentName && String(row.fromName || "").toLowerCase() !== String(args.agentName).toLowerCase()) {
          return false;
        }
        if (args.kind && row.effectiveKind !== args.kind) return false;
        if (args.stepIndex !== undefined && Number(row.stepIndex ?? -1) !== Number(args.stepIndex)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, Math.max(1, Math.min(args.limit ?? 150, 500)));

    return filtered;
  },
});

export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    fromAgentId: v.optional(v.id("agents")),
    fromName: v.optional(v.string()),
    content: v.string(),
    kind: v.optional(
      v.union(
        v.literal("note"),
        v.literal("worklog"),
        v.literal("handoff"),
        v.literal("review"),
        v.literal("system")
      )
    ),
    stepIndex: v.optional(v.number()),
    workflowKind: v.optional(
      v.union(
        v.literal("general"),
        v.literal("review"),
        v.literal("debug"),
        v.literal("incident"),
        v.literal("architecture"),
        v.literal("standup"),
        v.literal("deploy_checklist")
      )
    ),
    isSystemMessage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Parse @mentions from content
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(args.content)) !== null) {
      mentions.push(match[1].toLowerCase());
    }

    // Resolve mentioned agent IDs
    const mentionedAgentIds: string[] = [];
    if (mentions.length > 0) {
      const allAgents = await ctx.db.query("agents").collect();
      for (const mention of mentions) {
        const agent = allAgents.find(
          (a) => a.name.toLowerCase() === mention
        );
        if (agent) {
          mentionedAgentIds.push(agent._id);
        }
      }
    }

    const messageId = await ctx.db.insert("messages", {
      taskId: args.taskId,
      fromAgentId: args.fromAgentId,
      fromName: args.fromName ?? "System",
      content: args.content,
      kind: args.kind,
      stepIndex: args.stepIndex,
      workflowKind: args.workflowKind,
      mentionedAgentIds:
        mentionedAgentIds.length > 0
          ? (mentionedAgentIds as any)
          : undefined,
      isSystemMessage: args.isSystemMessage,
    });

    // Update task comment count; only assignee-authored comments count as assignee progress.
    const task = await ctx.db.get(args.taskId);
    if (task) {
      let bumpAssigneeUpdate = false;
      if (args.fromAgentId && (task.assigneeIds ?? []).some((id) => id === args.fromAgentId)) {
        bumpAssigneeUpdate = true;
      } else if (args.fromName && (task.assigneeIds?.length ?? 0) > 0) {
        const assignees = await Promise.all((task.assigneeIds ?? []).map((id) => ctx.db.get(id)));
        const assigneeNames = new Set(
          assignees.map((a) => a?.name?.toLowerCase()).filter(Boolean)
        );
        if (assigneeNames.has(args.fromName.toLowerCase())) bumpAssigneeUpdate = true;
      }

      await ctx.db.patch(args.taskId, {
        commentCount: (task.commentCount ?? 0) + 1,
        ...(bumpAssigneeUpdate ? { lastAssigneeUpdateAt: Date.now() } : {}),
      });
    }

    // Create notifications for mentions
    for (const agentId of mentionedAgentIds) {
      const task = await ctx.db.get(args.taskId);
      await ctx.db.insert("notifications", {
        mentionedAgentId: agentId as any,
        content: `${args.fromName ?? "Someone"} mentioned you in ${task?.title ?? "a task"}: "${args.content.slice(0, 100)}"`,
        taskId: args.taskId,
        taskTitle: task?.title,
        fromAgentId: args.fromAgentId,
        fromAgentName: args.fromName,
        delivered: false,
      });
    }

    // Log activity
    const task2 = await ctx.db.get(args.taskId);
    await ctx.db.insert("activities", {
      type: "message_sent",
      agentId: args.fromAgentId,
      agentName: args.fromName,
      taskId: args.taskId,
      taskTitle: task2?.title,
      message: `${args.fromName ?? "Someone"} commented on '${task2?.title ?? "a task"}'`,
    });

    return messageId;
  },
});
