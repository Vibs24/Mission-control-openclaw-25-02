import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    emoji: v.string(),
    sessionKey: v.string(),
    bio: v.string(),
    skills: v.array(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("blocked"),
      v.literal("paused")
    ),
    currentTaskId: v.optional(v.id("tasks")),
    lastHeartbeat: v.optional(v.number()),
  }).index("by_session_key", ["sessionKey"]),

  tasks: defineTable({
    title: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("waiting"),
      v.literal("blocked"),
      v.literal("done")
    ),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("normal"),
      v.literal("low")
    ),
    labels: v.array(v.string()),
    assigneeIds: v.array(v.id("agents")),
    creatorId: v.optional(v.id("agents")),
    parentTaskId: v.optional(v.id("tasks")),
    commentCount: v.optional(v.number()),
    attachmentCount: v.optional(v.number()),
    source: v.optional(v.union(v.literal("manual"), v.literal("telegram"))),
    sourceRef: v.optional(
      v.object({
        chatId: v.string(),
        messageId: v.number(),
        updateId: v.number(),
        username: v.optional(v.string()),
        displayName: v.optional(v.string()),
      })
    ),
    requesterName: v.optional(v.string()),
    requesterTelegramUserId: v.optional(v.string()),
    intakeText: v.optional(v.string()),
    chiefAgentId: v.optional(v.id("agents")),
    reviewerAgentId: v.optional(v.id("agents")),
    reviewRequired: v.optional(v.boolean()),
    reviewStatus: v.optional(
      v.union(
        v.literal("not_required"),
        v.literal("pending"),
        v.literal("in_review"),
        v.literal("changes_requested"),
        v.literal("approved")
      )
    ),
    acceptanceCriteria: v.optional(v.array(v.string())),
    nextAction: v.optional(v.string()),
    nextCheckAt: v.optional(v.number()),
    lastChiefCheckAt: v.optional(v.number()),
    lastAssigneeUpdateAt: v.optional(v.number()),
    staleAfterMinutes: v.optional(v.number()),
    escalationLevel: v.optional(v.number()),
    automationState: v.optional(
      v.union(
        v.literal("new"),
        v.literal("triage_pending"),
        v.literal("assigned"),
        v.literal("executing"),
        v.literal("review_pending"),
        v.literal("completed"),
        v.literal("errored")
      )
    ),
  })
    .index("by_status", ["status"])
    .index("by_assignee", ["assigneeIds"])
    .index("by_source", ["source"]),

  messages: defineTable({
    taskId: v.id("tasks"),
    fromAgentId: v.optional(v.id("agents")),
    fromName: v.optional(v.string()),
    content: v.string(),
    attachments: v.optional(v.array(v.id("documents"))),
    mentionedAgentIds: v.optional(v.array(v.id("agents"))),
    isSystemMessage: v.optional(v.boolean()),
  }).index("by_task", ["taskId"]),

  activities: defineTable({
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
  }).index("by_agent", ["agentId"]),

  documents: defineTable({
    title: v.string(),
    content: v.string(),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("runbook"),
      v.literal("protocol"),
      v.literal("standalone")
    ),
    taskId: v.optional(v.id("tasks")),
    isPinned: v.optional(v.boolean()),
    createdBy: v.optional(v.id("agents")),
    createdByName: v.optional(v.string()),
  })
    .index("by_task", ["taskId"])
    .index("by_pinned", ["isPinned"]),

  notifications: defineTable({
    mentionedAgentId: v.id("agents"),
    content: v.string(),
    taskId: v.optional(v.id("tasks")),
    taskTitle: v.optional(v.string()),
    fromAgentId: v.optional(v.id("agents")),
    fromAgentName: v.optional(v.string()),
    delivered: v.boolean(),
  })
    .index("by_agent", ["mentionedAgentId"])
    .index("by_delivered", ["delivered"]),

  chatMessages: defineTable({
    fromAgentId: v.optional(v.id("agents")),
    fromName: v.string(),
    fromEmoji: v.string(),
    content: v.string(),
    channel: v.optional(v.string()),
  }).index("by_channel", ["channel"]),

  telegramIntakeEvents: defineTable({
    updateId: v.number(),
    chatId: v.string(),
    userId: v.string(),
    messageId: v.number(),
    text: v.string(),
    receivedVia: v.union(v.literal("webhook"), v.literal("poller")),
    parsedAs: v.union(v.literal("task"), v.literal("ignored"), v.literal("command")),
    taskId: v.optional(v.id("tasks")),
    processedAt: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_update_id", ["updateId"])
    .index("by_chat", ["chatId"]),

  taskReviews: defineTable({
    taskId: v.id("tasks"),
    reviewerAgentId: v.id("agents"),
    status: v.union(v.literal("pass"), v.literal("fail")),
    summary: v.string(),
    findings: v.array(v.string()),
    evidenceRefs: v.optional(v.array(v.string())),
    reviewedAt: v.number(),
  }).index("by_task", ["taskId"]),

  automationRuns: defineTable({
    taskId: v.id("tasks"),
    role: v.union(v.literal("chief"), v.literal("specialist"), v.literal("reviewer")),
    agentName: v.string(),
    dispatchType: v.union(
      v.literal("triage"),
      v.literal("execution"),
      v.literal("monitor"),
      v.literal("review")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("retrying")
    ),
    attempt: v.number(),
    inputSummary: v.optional(v.string()),
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_status", ["status"]),

  taskAgentSteps: defineTable({
    taskId: v.id("tasks"),
    stepIndex: v.number(),
    agentId: v.id("agents"),
    agentName: v.string(),
    role: v.union(v.literal("chief"), v.literal("specialist"), v.literal("reviewer")),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting_handoff"),
      v.literal("handed_off"),
      v.literal("blocked"),
      v.literal("skipped"),
      v.literal("failed"),
      v.literal("completed")
    ),
    requiredProof: v.union(
      v.literal("comment_summary"),
      v.literal("output_path"),
      v.literal("document"),
      v.literal("none")
    ),
    startedAt: v.optional(v.number()),
    lastProgressAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    proofSummary: v.optional(v.string()),
    proofPaths: v.optional(v.array(v.string())),
    proofMessageId: v.optional(v.id("messages")),
    proofDocumentIds: v.optional(v.array(v.id("documents"))),
    dispatchRunIds: v.optional(v.array(v.id("automationRuns"))),
    handoffToAgentId: v.optional(v.id("agents")),
    handoffAt: v.optional(v.number()),
    handoffBy: v.optional(v.string()),
    handoffValid: v.optional(v.boolean()),
    stuckReason: v.optional(v.string()),
    escalationCount: v.optional(v.number()),
  })
    .index("by_task_step", ["taskId", "stepIndex"])
    .index("by_task_status", ["taskId", "status"])
    .index("by_agent_status", ["agentId", "status"]),
});
