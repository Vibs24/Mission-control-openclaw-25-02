import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    if (args.taskId) {
      return await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!))
        .collect();
    }
    return await ctx.db.query("documents").collect();
  },
});

export const listPinned = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_pinned", (q) => q.eq("isPinned", true))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
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
    createdById: v.optional(v.id("agents")),
    createdByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const docId = await ctx.db.insert("documents", {
      title: args.title,
      content: args.content,
      type: args.type,
      taskId: args.taskId,
      isPinned: args.isPinned,
      createdBy: args.createdById,
      createdByName: args.createdByName,
    });

    await ctx.db.insert("activities", {
      type: "document_created",
      agentId: args.createdById,
      agentName: args.createdByName,
      taskId: args.taskId,
      message: `Document created: ${args.title}`,
    });

    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (task) {
        await ctx.db.patch(args.taskId, {
          attachmentCount: (task.attachmentCount ?? 0) + 1,
        });
      }
    }

    return docId;
  },
});

export const togglePin = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return;
    await ctx.db.patch(args.id, { isPinned: !doc.isPinned });
  },
});

export const seedDocuments = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("documents").collect();
    if (existing.length > 0) return { message: "Docs already seeded" };

    const agents = await ctx.db.query("agents").collect();
    const steve = agents.find((a) => a.name === "Steve");
    const tasks = await ctx.db.query("tasks").collect();
    const runbookTask = tasks.find((t) =>
      t.title.includes("Known Issues")
    );

    await ctx.db.insert("documents", {
      title: "Known Issues Runbook — IT Platform (Live)",
      content: `# Known Issues Runbook — IT Platform

**Owner:** Steve 🛡️ (Stability, Ops & Runbooks)
**Last Updated:** ${new Date().toISOString().split("T")[0]}
**Status:** Living document — updated after every confirmed incident

> This runbook is the source of truth for recurring platform issues. When a new incident fires, check here first. When an incident resolves, update here immediately.

## Quick Reference — Issue Status Board

| # | Issue | Trigger | Workaround | Fix Status |
|---|-------|---------|------------|------------|
| 1 | API Gateway Latency | Traffic > 10k req/s | Scale load balancer | In progress |
| 2 | SSO Login Failure | Auth service restart | Force re-auth | Patching |
| 3 | Telegram Bot Crash | Rate limit exceeded | Restart handler | Needs backoff |
| 4 | Database Failover | Primary CPU > 90% | Auto-failover kicks in | Documented |

## Issue 1: API Gateway Latency Spike

**Trigger:** P99 latency > 200ms for 5+ minutes

**Detection:**
\`\`\`bash
datadog metric query "avg:aws.applicationelb.target_response_time{*}"
\`\`\`

**Steps:**
1. Check ELB healthy host count
2. Check downstream service response times
3. Scale load balancer target group if needed
4. Alert #it-ops if not resolved in 15 min

---

## Issue 2: SSO Login Failure

**Trigger:** Enterprise SSO accounts report auth errors after service restart

**Affected:** H1/Enterprise tier accounts with SAML SSO configured

**Workaround:** Direct users to force re-authenticate via /logout?force=true

**Root cause:** Session tokens not invalidated properly on auth service restart

**Fix:** Scheduled for next release cycle
`,
      type: "runbook",
      taskId: runbookTask?._id,
      isPinned: true,
      createdBy: steve?._id,
      createdByName: steve?.name ?? "Steve",
    });

    await ctx.db.insert("documents", {
      title: "IT Infrastructure Overview",
      content: `# IT Infrastructure Overview

## Architecture

- **Primary Region:** us-east-1
- **DR Region:** eu-west-1
- **CDN:** CloudFront
- **Database:** RDS PostgreSQL (Multi-AZ)
- **Cache:** ElastiCache Redis
- **Monitoring:** Datadog + PagerDuty
- **Alerts Channel:** #it-alerts (Slack)

## Service SLAs

| Service | SLA | Current Uptime |
|---------|-----|----------------|
| API Gateway | 99.9% | 99.94% |
| Auth Service | 99.95% | 99.87% |
| Database | 99.99% | 99.99% |
| CDN | 99.9% | 100% |
`,
      type: "standalone",
      isPinned: false,
      createdBy: steve?._id,
      createdByName: steve?.name ?? "Steve",
    });

    return { message: "Documents seeded" };
  },
});
