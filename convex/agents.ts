import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("agents"),
    status: v.union(
      v.literal("active"),
      v.literal("idle"),
      v.literal("blocked"),
      v.literal("paused")
    ),
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      currentTaskId: args.currentTaskId,
      lastHeartbeat: Date.now(),
    });
  },
});

export const seedAgents = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("agents").collect();

    const agents = [
      {
        name: "Jarvis",
        role: "Lead Agent / IT Chief of Staff",
        emoji: "👑",
        sessionKey: "agent:main:main",
        bio:
          "IT orchestrator and squad lead. Handles all incoming requests, delegates to specialists, monitors infrastructure health, and ensures nothing falls through the cracks. Your first point of contact for everything IT.",
        skills: ["coordination", "triage", "escalation", "strategy", "delegation"],
        status: "active" as const,
      },
      {
        name: "Bruce",
        role: "IT Analytics & Infrastructure Monitoring",
        emoji: "🖥️",
        sessionKey: "agent:it-analytics:main",
        bio:
          "Metrics-obsessed infrastructure watcher. Monitors system health, uptime, performance dashboards, and capacity trends. Finds anomalies before they become incidents.",
        skills: ["monitoring", "dashboards", "capacity-planning", "alerting", "metrics"],
        status: "active" as const,
      },
      {
        name: "Natasha",
        role: "IT Support & Intelligence",
        emoji: "🕷️",
        sessionKey: "agent:it-support:main",
        bio:
          "Front-line IT support and pattern detector. Handles tickets, triages incidents, spots recurring issues, and builds the institutional knowledge to prevent them from happening again.",
        skills: [
          "ticket-triage",
          "incident-response",
          "root-cause-analysis",
          "user-support",
          "knowledge-base",
        ],
        status: "active" as const,
      },
      {
        name: "Peter",
        role: "IT Documentation & Content",
        emoji: "🌐",
        sessionKey: "agent:it-docs:main",
        bio:
          "Keeper of all IT knowledge. Writes runbooks, user guides, changelogs, and how-to documentation. Makes sure the team never has to figure the same thing out twice.",
        skills: [
          "technical-writing",
          "runbooks",
          "changelogs",
          "user-guides",
          "knowledge-management",
        ],
        status: "idle" as const,
      },
      {
        name: "Dev",
        role: "Software Development & Automation",
        emoji: "💻",
        sessionKey: "agent:it-dev:main",
        bio:
          "Coding specialist for implementation work. Builds features, fixes bugs, writes scripts, and delivers tested code changes with clear output paths and evidence.",
        skills: [
          "coding",
          "python",
          "automation",
          "debugging",
          "implementation",
          "testing",
        ],
        status: "active" as const,
      },
      {
        name: "Steve",
        role: "Stability, Ops & Runbooks",
        emoji: "🛡️",
        sessionKey: "agent:it-ops:main",
        bio:
          "Guardian of system stability. Owns disaster recovery, incident playbooks, change management, and post-mortems. When things go wrong, Steve already has the runbook.",
        skills: [
          "disaster-recovery",
          "change-management",
          "post-mortems",
          "playbooks",
          "sla-compliance",
        ],
        status: "active" as const,
      },
      {
        name: "Reviewer",
        role: "QA / Verification & Acceptance",
        emoji: "✅",
        sessionKey: "agent:reviewer:main",
        bio:
          "Independent verifier for task outcomes. Validates correctness, completeness, and evidence before tasks move to done. Rejects vague or unproven work.",
        skills: [
          "acceptance-testing",
          "qa-review",
          "evidence-validation",
          "checklists",
          "quality-gates",
        ],
        status: "active" as const,
      },
    ];

    const existingNames = new Set(existing.map((a) => a.name));
    let inserted = 0;
    for (const agent of agents) {
      if (existingNames.has(agent.name)) continue;
      await ctx.db.insert("agents", agent);
      inserted += 1;
    }

    if (inserted === 0) return { message: "Agents already seeded" };
    return { message: `Seeded ${inserted} IT agents` };
  },
});

export const seedSampleTasks = mutation({
  args: {},
  handler: async (ctx) => {
    const existingTasks = await ctx.db.query("tasks").collect();
    if (existingTasks.length > 0) return { message: "Tasks already seeded" };

    const agents = await ctx.db.query("agents").collect();
    const jarvis = agents.find((a) => a.name === "Jarvis");
    const bruce = agents.find((a) => a.name === "Bruce");
    const natasha = agents.find((a) => a.name === "Natasha");
    const peter = agents.find((a) => a.name === "Peter");
    const steve = agents.find((a) => a.name === "Steve");

    if (!jarvis || !bruce || !natasha || !peter || !steve) {
      return { message: "Seed agents first" };
    }

    const tasks = [
      {
        title: "Investigate API Gateway Latency Spike",
        description:
          "**CRITICAL** — API gateway latency jumped from 45ms to 320ms at 14:30 UTC. Affects all downstream services. Check load balancer logs, check CloudWatch metrics, identify root cause.",
        status: "in_progress" as const,
        priority: "urgent" as const,
        labels: ["incident", "infrastructure", "api-gateway"],
        assigneeIds: [bruce._id],
        commentCount: 3,
        attachmentCount: 1,
      },
      {
        title: "Recurring Login Failures — H1 Accounts",
        description:
          "**Recurring issue** — Multiple H1 enterprise accounts reporting login failures since the auth service update. Pattern: affects users with SSO configured. Need root cause + fix.",
        status: "assigned" as const,
        priority: "high" as const,
        labels: ["support", "auth", "recurring", "h1"],
        assigneeIds: [natasha._id],
        commentCount: 7,
        attachmentCount: 0,
      },
      {
        title: "Write Incident Runbook: Database Failover",
        description:
          "We've had two database failovers this quarter with no documented recovery procedure. Create a runbook covering detection, escalation steps, recovery commands, and rollback procedures.",
        status: "assigned" as const,
        priority: "high" as const,
        labels: ["runbook", "database", "documentation"],
        assigneeIds: [steve._id, peter._id],
        commentCount: 2,
        attachmentCount: 0,
      },
      {
        title: "Capacity Planning: Q2 Infrastructure Forecast",
        description:
          "Current growth rate suggests we'll hit 80% CPU capacity on primary clusters by end of Q2. Need a forecast model + scaling recommendation before budget freeze.",
        status: "review" as const,
        priority: "high" as const,
        labels: ["capacity", "infrastructure", "planning"],
        assigneeIds: [bruce._id],
        commentCount: 5,
        attachmentCount: 2,
      },
      {
        title: "Set Up Alert: Token Burn Rate Monitoring",
        description:
          "Create a Datadog alert that fires when token burn rate exceeds 150% of baseline for more than 5 minutes. Route to #it-alerts Slack channel.",
        status: "inbox" as const,
        priority: "normal" as const,
        labels: ["monitoring", "alerting", "token-burn"],
        assigneeIds: [],
        commentCount: 0,
        attachmentCount: 0,
      },
      {
        title: "Known Issues Runbook — Platform Stability",
        description:
          "Compile all recurring platform issues into a single source of truth. Format: issue name | trigger | workaround | permanent fix status. Living document — update after every confirmed incident.",
        status: "done" as const,
        priority: "urgent" as const,
        labels: ["runbook", "stability", "documentation"],
        assigneeIds: [steve._id],
        commentCount: 12,
        attachmentCount: 3,
      },
      {
        title: "Telegram Handler Stability — Critical",
        description:
          "Telegram bot handler crashing intermittently with rate-limit errors. Affects all agents. Need exponential backoff + queue implementation.",
        status: "blocked" as const,
        priority: "urgent" as const,
        labels: ["support", "telegram-bot", "critical", "recurring"],
        assigneeIds: [natasha._id],
        commentCount: 11,
        attachmentCount: 0,
      },
      {
        title: "IT Onboarding Guide v2",
        description:
          "Current onboarding doc is outdated (2024). Rewrite to reflect new tooling: Datadog, PagerDuty, Runbook system, and Mission Control agent squad.",
        status: "inbox" as const,
        priority: "normal" as const,
        labels: ["documentation", "onboarding"],
        assigneeIds: [],
        commentCount: 0,
        attachmentCount: 0,
      },
    ];

    for (const task of tasks) {
      const taskId = await ctx.db.insert("tasks", task);

      await ctx.db.insert("activities", {
        type: "task_created",
        agentId: jarvis._id,
        agentName: jarvis.name,
        taskId,
        taskTitle: task.title,
        message: `Jarvis created task: ${task.title}`,
      });
    }

    return { message: `Seeded ${tasks.length} sample IT tasks` };
  },
});
