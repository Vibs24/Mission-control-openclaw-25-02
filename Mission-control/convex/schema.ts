import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    role: v.string(),
    roleKey: v.optional(
      v.union(
        v.literal("chief"),
        v.literal("project_manager"),
        v.literal("frontend"),
        v.literal("designer"),
        v.literal("database"),
        v.literal("backend"),
        v.literal("documentation"),
        v.literal("operations"),
        v.literal("reviewer"),
        v.literal("legacy")
      )
    ),
    specialty: v.optional(v.string()),
    routable: v.optional(v.boolean()),
    retired: v.optional(v.boolean()),
    displayOrder: v.optional(v.number()),
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
  })
    .index("by_session_key", ["sessionKey"])
    .index("by_name", ["name"])
    .index("by_role_key", ["roleKey"])
    .index("by_routable", ["routable"])
    .index("by_retired", ["retired"]),

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
    graphReadyAt: v.optional(v.number()),
    artifactRootPath: v.optional(v.string()),
    artifactPolicy: v.optional(v.union(v.literal("auto_managed"), v.literal("manual"))),
    artifactLastVerifiedAt: v.optional(v.number()),
    telegramDeliveryState: v.optional(
      v.union(
        v.literal("ok"),
        v.literal("disabled_chat"),
        v.literal("transient_failure"),
        v.literal("unknown")
      )
    ),
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
    .index("by_source", ["source"])
    .index("by_orchestration_model", ["orchestrationModel"])
    .index("by_orchestration_model_status", ["orchestrationModel", "status"]),

  messages: defineTable({
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
  })
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"]),

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

  taskExecutionNodes: defineTable({
    taskId: v.id("tasks"),
    nodeKey: v.string(),
    agentId: v.id("agents"),
    agentName: v.string(),
    role: v.union(
      v.literal("chief"),
      v.literal("project_manager"),
      v.literal("specialist"),
      v.literal("reviewer")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("dependency_wait"),
      v.literal("runnable"),
      v.literal("running"),
      v.literal("waiting_handoff"),
      v.literal("blocked"),
      v.literal("failed"),
      v.literal("completed"),
      v.literal("skipped")
    ),
    dependsOnNodeKeys: v.array(v.string()),
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
    stuckReason: v.optional(v.string()),
    retryCount: v.optional(v.number()),
    escalationCount: v.optional(v.number()),
    workDone: v.optional(v.string()),
    workingNow: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    blockers: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_task_node", ["taskId", "nodeKey"])
    .index("by_task_status", ["taskId", "status"])
    .index("by_agent_status", ["agentId", "status"])
    .index("by_task_created", ["taskId", "createdAt"]),

  executionEvents: defineTable({
    taskId: v.optional(v.id("tasks")),
    actorAgentId: v.optional(v.id("agents")),
    actorName: v.string(),
    actorRole: v.union(
      v.literal("chief"),
      v.literal("project_manager"),
      v.literal("specialist"),
      v.literal("reviewer"),
      v.literal("system")
    ),
    kind: v.union(
      v.literal("triage"),
      v.literal("dispatch"),
      v.literal("worklog"),
      v.literal("heartbeat"),
      v.literal("handoff"),
      v.literal("proof"),
      v.literal("review"),
      v.literal("recovery"),
      v.literal("system")
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning"),
      v.literal("error")
    ),
    title: v.string(),
    summary: v.string(),
    workDone: v.optional(v.string()),
    workingNow: v.optional(v.string()),
    nextSteps: v.optional(v.string()),
    blockers: v.optional(v.string()),
    evidencePaths: v.optional(v.array(v.string())),
    detailsMarkdown: v.optional(v.string()),
    detailsJson: v.optional(v.any()),
    relatedMessageId: v.optional(v.id("messages")),
    relatedStepId: v.optional(v.id("taskAgentSteps")),
    relatedRunId: v.optional(v.id("automationRuns")),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_task_created", ["taskId", "createdAt"])
    .index("by_actor_created", ["actorAgentId", "createdAt"])
    .index("by_task_kind", ["taskId", "kind"]),
});
