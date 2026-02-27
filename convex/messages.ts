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

export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    fromAgentId: v.optional(v.id("agents")),
    fromName: v.optional(v.string()),
    content: v.string(),
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
