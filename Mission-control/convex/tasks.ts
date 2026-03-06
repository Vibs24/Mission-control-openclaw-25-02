import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    workflowCommand: v.optional(v.string()),
    workflowVersion: v.optional(v.number()),
    orchestrationModel: v.optional(
      v.union(v.literal("legacy_sequential"), v.literal("chief_pm_parallel"))
    ),
    projectManagerAgentId: v.optional(v.id("agents")),
    dependencySpec: v.optional(v.string()),
    graphVersion: v.optional(v.number()),
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
      workflowKind: args.workflowKind ?? "general",
      workflowCommand: args.workflowCommand,
      workflowVersion: args.workflowVersion ?? 1,
      orchestrationModel: args.orchestrationModel ?? "chief_pm_parallel",
      projectManagerAgentId: args.projectManagerAgentId,
      dependencySpec: args.dependencySpec,
      graphVersion: args.graphVersion ?? 1,
      artifactPolicy: "auto_managed",
    });

    const artifactRootPath = buildArtifactRootPath(String(taskId), args.title);
    await ctx.db.patch(taskId, {
      artifactRootPath,
      artifactPolicy: "auto_managed",
    });

    await ctx.db.insert("activities", {
      type: "task_created",
      agentId: args.creatorId,
      taskId,
      taskTitle: args.title,
      message: `New task created: ${args.title} (artifact root: ${artifactRootPath})`,
    });

    return taskId;
  },
});

export const setArtifactRootPath = mutation({
  args: {
    id: v.id("tasks"),
    artifactRootPath: v.string(),
    artifactPolicy: v.optional(v.union(v.literal("auto_managed"), v.literal("manual"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    await ctx.db.patch(args.id, {
      artifactRootPath: args.artifactRootPath,
      artifactPolicy: args.artifactPolicy ?? task.artifactPolicy ?? "auto_managed",
    });
    return await ctx.db.get(args.id);
  },
});

export const backfillArtifactRootPath = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    const existing = String(task.artifactRootPath || "").trim();
    if (existing) {
      if (!task.artifactPolicy) {
        await ctx.db.patch(args.id, { artifactPolicy: "auto_managed" });
      }
      return { taskId: task._id, artifactRootPath: existing, updated: false };
    }
    const artifactRootPath = buildArtifactRootPath(String(task._id), task.title);
    await ctx.db.patch(args.id, {
      artifactRootPath,
      artifactPolicy: task.artifactPolicy ?? "auto_managed",
    });
    return { taskId: task._id, artifactRootPath, updated: true };
  },
});

export const touchArtifactVerification = mutation({
  args: {
    id: v.id("tasks"),
    artifactLastVerifiedAt: v.optional(v.number()),
    artifactRootPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    const patch: Record<string, unknown> = {
      artifactLastVerifiedAt: args.artifactLastVerifiedAt ?? Date.now(),
    };
    if (args.artifactRootPath) {
      patch.artifactRootPath = args.artifactRootPath;
      patch.artifactPolicy = task.artifactPolicy ?? "auto_managed";
    }
    await ctx.db.patch(args.id, patch);
    return await ctx.db.get(args.id);
  },
});

export const updateWorkflowMeta = mutation({
  args: {
    id: v.id("tasks"),
    workflowKind: v.union(
      v.literal("general"),
      v.literal("review"),
      v.literal("debug"),
      v.literal("incident"),
      v.literal("architecture"),
      v.literal("standup"),
      v.literal("deploy_checklist")
    ),
    workflowCommand: v.optional(v.string()),
    workflowVersion: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    nextAction: v.optional(v.string()),
    orchestrationModel: v.optional(
      v.union(v.literal("legacy_sequential"), v.literal("chief_pm_parallel"))
    ),
    projectManagerAgentId: v.optional(v.id("agents")),
    dependencySpec: v.optional(v.string()),
    graphVersion: v.optional(v.number()),
    graphReadyAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    await ctx.db.patch(args.id, {
      workflowKind: args.workflowKind,
      workflowCommand: args.workflowCommand ?? task.workflowCommand,
      workflowVersion: args.workflowVersion ?? task.workflowVersion ?? 1,
      labels: args.labels ?? task.labels,
      nextAction: args.nextAction ?? task.nextAction,
      orchestrationModel: args.orchestrationModel ?? task.orchestrationModel,
      projectManagerAgentId: args.projectManagerAgentId ?? task.projectManagerAgentId,
      dependencySpec: args.dependencySpec ?? task.dependencySpec,
      graphVersion: args.graphVersion ?? task.graphVersion,
      graphReadyAt: args.graphReadyAt ?? task.graphReadyAt,
    });
    return await ctx.db.get(args.id);
  },
});

export const setOrchestrationModel = mutation({
  args: {
    id: v.id("tasks"),
    orchestrationModel: v.union(v.literal("legacy_sequential"), v.literal("chief_pm_parallel")),
    chiefAgentId: v.optional(v.id("agents")),
    projectManagerAgentId: v.optional(v.id("agents")),
    dependencySpec: v.optional(v.string()),
    graphVersion: v.optional(v.number()),
    graphReadyAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) return null;
    await ctx.db.patch(args.id, {
      orchestrationModel: args.orchestrationModel,
      chiefAgentId: args.chiefAgentId ?? task.chiefAgentId,
      projectManagerAgentId: args.projectManagerAgentId ?? task.projectManagerAgentId,
      dependencySpec: args.dependencySpec ?? task.dependencySpec,
      graphVersion: args.graphVersion ?? task.graphVersion ?? 1,
      graphReadyAt: args.graphReadyAt ?? task.graphReadyAt,
    });
    return await ctx.db.get(args.id);
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

export const stopAndDelete = mutation({
  args: {
    id: v.id("tasks"),
    agentId: v.optional(v.id("agents")),
    agentName: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      return {
        ok: false,
        deleted: false,
        reason: "task_not_found",
      };
    }

    const deleted = {
      messages: 0,
      activities: 0,
      executionEvents: 0,
      documents: 0,
      notifications: 0,
      taskReviews: 0,
      automationRuns: 0,
      taskAgentSteps: 0,
      taskExecutionNodes: 0,
      telegramIntakeEvents: 0,
      childTasksUnlinked: 0,
      agentsReleased: 0,
    };

    const releaseAgentIfAssigned = async (agentId: any) => {
      const agent = (await ctx.db.get(agentId)) as any;
      if (!agent) return;
      if (agent.currentTaskId !== args.id) return;
      await ctx.db.patch(agent._id, {
        currentTaskId: undefined,
        status: agent.status === "paused" ? "paused" : "active",
      });
      deleted.agentsReleased += 1;
    };

    for (const assigneeId of task.assigneeIds ?? []) {
      await releaseAgentIfAssigned(assigneeId);
    }
    if (task.chiefAgentId) await releaseAgentIfAssigned(task.chiefAgentId);
    if (task.reviewerAgentId) await releaseAgentIfAssigned(task.reviewerAgentId);

    const taskMessages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskMessages) {
      await ctx.db.delete(row._id);
      deleted.messages += 1;
    }

    const taskActivities = await ctx.db
      .query("activities")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskActivities) {
      await ctx.db.delete(row._id);
      deleted.activities += 1;
    }

    const taskExecutionEvents = await ctx.db
      .query("executionEvents")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskExecutionEvents) {
      await ctx.db.delete(row._id);
      deleted.executionEvents += 1;
    }

    const taskDocs = await ctx.db
      .query("documents")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskDocs) {
      await ctx.db.delete(row._id);
      deleted.documents += 1;
    }

    const taskReviews = await ctx.db
      .query("taskReviews")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskReviews) {
      await ctx.db.delete(row._id);
      deleted.taskReviews += 1;
    }

    const taskRuns = await ctx.db
      .query("automationRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskRuns) {
      await ctx.db.delete(row._id);
      deleted.automationRuns += 1;
    }

    const taskSteps = await ctx.db
      .query("taskAgentSteps")
      .withIndex("by_task_step", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskSteps) {
      await ctx.db.delete(row._id);
      deleted.taskAgentSteps += 1;
    }

    const taskNodes = await ctx.db
      .query("taskExecutionNodes")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.id))
      .collect();
    for (const row of taskNodes) {
      await ctx.db.delete(row._id);
      deleted.taskExecutionNodes += 1;
    }

    const taskNotifications = (await ctx.db.query("notifications").collect()).filter(
      (row) => row.taskId === args.id
    );
    for (const row of taskNotifications) {
      await ctx.db.delete(row._id);
      deleted.notifications += 1;
    }

    const taskTelegramEvents = (await ctx.db.query("telegramIntakeEvents").collect()).filter(
      (row) => row.taskId === args.id
    );
    for (const row of taskTelegramEvents) {
      await ctx.db.delete(row._id);
      deleted.telegramIntakeEvents += 1;
    }

    const childTasks = (await ctx.db.query("tasks").collect()).filter(
      (row) => row.parentTaskId === args.id
    );
    for (const row of childTasks) {
      await ctx.db.patch(row._id, { parentTaskId: undefined });
      deleted.childTasksUnlinked += 1;
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("activities", {
      type: "task_status_changed",
      agentId: args.agentId,
      agentName: args.agentName,
      taskId: undefined,
      taskTitle: task.title,
      message:
        `${args.agentName ?? "System"} deleted task '${task.title}'` +
        (args.reason ? ` (${args.reason})` : ""),
      metadata: {
        action: "task_deleted",
        deletedTaskId: args.id,
      },
    });

    return {
      ok: true,
      deleted: true,
      taskId: args.id,
      taskTitle: task.title,
      counts: deleted,
    };
  },
});
