import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const canonicalRoleAgents = [
  {
    roleKey: "chief" as const,
    name: "Chief",
    role: "Chief Agent / Orchestration Authority",
    specialty: "Triage, policy enforcement, escalation, and recovery control.",
    emoji: "👑",
    sessionKey: "agent:chief:main",
    displayOrder: 1,
    bio:
      "Primary orchestration authority. Owns intake triage, escalation control, and recovery policy enforcement.",
    skills: ["orchestration", "triage", "escalation", "recovery-control", "governance"],
    status: "active" as const,
  },
  {
    roleKey: "project_manager" as const,
    name: "Project Manager",
    role: "Project Manager / Dependency Coordinator",
    specialty: "Dependency graph planning and parallel node scheduling.",
    emoji: "📋",
    sessionKey: "agent:project-manager:main",
    displayOrder: 2,
    bio:
      "Coordinates specialist dependency graph execution, parallel scheduling, and handoff sequencing.",
    skills: ["planning", "dependency-management", "parallel-scheduling", "handoff-control"],
    status: "active" as const,
  },
  {
    roleKey: "frontend" as const,
    name: "Frontend",
    role: "Frontend Specialist",
    specialty: "UI implementation, responsiveness, and client-side behavior.",
    emoji: "🧩",
    sessionKey: "agent:frontend:main",
    displayOrder: 3,
    bio:
      "Builds frontend UI/UX implementation, component behavior, and responsive client features.",
    skills: ["frontend", "html", "css", "javascript", "ui-implementation"],
    status: "active" as const,
  },
  {
    roleKey: "designer" as const,
    name: "Designer",
    role: "Designer Specialist",
    specialty: "UX quality, visual hierarchy, and design consistency.",
    emoji: "🎨",
    sessionKey: "agent:designer:main",
    displayOrder: 4,
    bio:
      "Owns layout quality, visual hierarchy, and UX design intent for product-facing experiences.",
    skills: ["design", "ux", "visual-systems", "interaction-patterns", "style-guides"],
    status: "active" as const,
  },
  {
    roleKey: "database" as const,
    name: "Database",
    role: "Database Specialist",
    specialty: "Schema design, migrations, and persistence integrity.",
    emoji: "🗄️",
    sessionKey: "agent:database:main",
    displayOrder: 5,
    bio:
      "Designs schema, persistence strategy, migrations, and query-level correctness/performance checks.",
    skills: ["database-design", "sqlite", "schema", "query-optimization", "migrations"],
    status: "active" as const,
  },
  {
    roleKey: "backend" as const,
    name: "Backend",
    role: "Backend Specialist",
    specialty: "API/service implementation and backend reliability.",
    emoji: "🛠️",
    sessionKey: "agent:backend:main",
    displayOrder: 6,
    bio:
      "Implements backend APIs, service logic, integrations, and application execution reliability.",
    skills: ["backend", "python", "api-design", "service-integration", "debugging"],
    status: "active" as const,
  },
  {
    roleKey: "documentation" as const,
    name: "Documentation",
    role: "Documentation Specialist",
    specialty: "Runbooks, docs, and delivery communication.",
    emoji: "📝",
    sessionKey: "agent:documentation:main",
    displayOrder: 7,
    bio:
      "Creates technical docs, runbooks, operator procedures, and implementation handoff documentation.",
    skills: ["technical-writing", "runbooks", "knowledge-base", "operator-guides"],
    status: "active" as const,
  },
  {
    roleKey: "operations" as const,
    name: "Operations",
    role: "Operations Specialist",
    specialty: "Release safety, incident mitigation, and system stability.",
    emoji: "🛡️",
    sessionKey: "agent:operations:main",
    displayOrder: 8,
    bio:
      "Owns release safety, stability controls, incident mitigation, and operational validation.",
    skills: ["operations", "stability", "incident-response", "release-readiness", "rollback"],
    status: "active" as const,
  },
  {
    roleKey: "reviewer" as const,
    name: "Reviewer",
    role: "Reviewer / QA Verification",
    specialty: "Final proof validation and acceptance gate enforcement.",
    emoji: "✅",
    sessionKey: "agent:reviewer:main",
    displayOrder: 9,
    bio:
      "Independent verifier for task outcomes. Validates correctness, completeness, and evidence before tasks move to done.",
    skills: ["acceptance-testing", "qa-review", "evidence-validation", "checklists", "quality-gates"],
    status: "active" as const,
  },
];

const canonicalNames = new Set(canonicalRoleAgents.map((entry) => entry.name));

const legacyAgentNames = ["Jarvis", "Dev", "Bruce", "Natasha", "Peter", "Steve"];

function sortAgents(rows: any[]) {
  return [...rows].sort((a, b) => {
    const aOrder = Number(a.displayOrder ?? 999);
    const bOrder = Number(b.displayOrder ?? 999);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

async function ensureRoleAgentsInternal(ctx: any) {
  const rows = await ctx.db.query("agents").collect();
  const byName = new Map<string, any>(rows.map((row: any) => [String(row.name), row]));
  const byRoleKey = new Map<string, any>(
    rows
      .filter((row: any) => row.roleKey)
      .map((row: any) => [String(row.roleKey), row])
  );

  let inserted = 0;
  let updated = 0;

  for (const roleAgent of canonicalRoleAgents) {
    const existing = byRoleKey.get(roleAgent.roleKey) || byName.get(roleAgent.name);
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: roleAgent.name,
        role: roleAgent.role,
        roleKey: roleAgent.roleKey,
        specialty: roleAgent.specialty,
        routable: true,
        retired: false,
        displayOrder: roleAgent.displayOrder,
        emoji: roleAgent.emoji,
        sessionKey: roleAgent.sessionKey,
        bio: roleAgent.bio,
        skills: roleAgent.skills,
        status: existing.status ?? roleAgent.status,
      });
      updated += 1;
    } else {
      await ctx.db.insert("agents", {
        name: roleAgent.name,
        role: roleAgent.role,
        roleKey: roleAgent.roleKey,
        specialty: roleAgent.specialty,
        routable: true,
        retired: false,
        displayOrder: roleAgent.displayOrder,
        emoji: roleAgent.emoji,
        sessionKey: roleAgent.sessionKey,
        bio: roleAgent.bio,
        skills: roleAgent.skills,
        status: roleAgent.status,
        lastHeartbeat: Date.now(),
      });
      inserted += 1;
    }
  }

  return {
    inserted,
    updated,
    canonicalCount: canonicalRoleAgents.length,
  };
}

async function retireLegacyAgentsInternal(ctx: any) {
  const rows = await ctx.db.query("agents").collect();
  let retired = 0;

  for (const row of rows) {
    const isCanonical = canonicalNames.has(String(row.name));
    if (isCanonical) continue;

    const shouldRetire =
      legacyAgentNames.includes(String(row.name)) ||
      String(row.roleKey || "") === "legacy" ||
      !canonicalNames.has(String(row.name));
    if (!shouldRetire) continue;

    await ctx.db.patch(row._id, {
      roleKey: "legacy",
      specialty: row.specialty ?? row.role ?? "Legacy historical agent",
      routable: false,
      retired: true,
      displayOrder: Number(row.displayOrder ?? 9999),
      status: row.status === "blocked" ? "blocked" : "idle",
      currentTaskId: undefined,
    });
    retired += 1;
  }

  return { retired };
}

export const list = query({
  args: {
    includeRetired: v.optional(v.boolean()),
    routableOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const includeRetired = args.includeRetired !== false;
    const routableOnly = args.routableOnly === true;
    const rows = await ctx.db.query("agents").collect();
    const filtered = rows.filter((row) => {
      if (routableOnly && row.routable === false) return false;
      if (!includeRetired && row.retired === true) return false;
      return true;
    });
    return sortAgents(filtered);
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

export const ensureRoleAgents = mutation({
  args: {},
  handler: async (ctx) => {
    return await ensureRoleAgentsInternal(ctx);
  },
});

export const retireLegacyAgents = mutation({
  args: {},
  handler: async (ctx) => {
    return await retireLegacyAgentsInternal(ctx);
  },
});

export const seedAgents = mutation({
  args: {},
  handler: async (ctx) => {
    const ensured = await ensureRoleAgentsInternal(ctx);
    const retired = await retireLegacyAgentsInternal(ctx);
    return {
      message: "Canonical role agents ensured",
      ensured,
      retired,
    };
  },
});

export const seedSampleTasks = mutation({
  args: {},
  handler: async (ctx) => {
    const existingTasks = await ctx.db.query("tasks").collect();
    if (existingTasks.length > 0) return { message: "Tasks already seeded" };

    const agents = await ctx.db.query("agents").collect();
    const chief = agents.find((a) => a.roleKey === "chief" || a.name === "Chief");
    const backend = agents.find((a) => a.roleKey === "backend" || a.name === "Backend");
    const ops = agents.find((a) => a.roleKey === "operations" || a.name === "Operations");
    const designer = agents.find((a) => a.roleKey === "designer" || a.name === "Designer");
    const docs = agents.find((a) => a.roleKey === "documentation" || a.name === "Documentation");

    if (!chief || !backend || !ops || !designer || !docs) {
      return { message: "Seed canonical role agents first" };
    }

    const tasks = [
      {
        title: "Investigate API Gateway Latency Spike",
        description:
          "API gateway latency jumped from 45ms to 320ms. Check load balancer logs, metrics, and root cause.",
        status: "in_progress" as const,
        priority: "urgent" as const,
        labels: ["incident", "infrastructure", "api-gateway"],
        assigneeIds: [ops._id],
        commentCount: 3,
        attachmentCount: 1,
      },
      {
        title: "Recurring Login Failures",
        description:
          "Recurring auth failures after recent update. Identify pattern and remediation path.",
        status: "assigned" as const,
        priority: "high" as const,
        labels: ["support", "auth", "recurring"],
        assigneeIds: [backend._id, designer._id],
        commentCount: 2,
        attachmentCount: 0,
      },
      {
        title: "Write Incident Runbook: Database Failover",
        description:
          "Create recovery runbook covering detection, escalation, commands, and rollback.",
        status: "assigned" as const,
        priority: "high" as const,
        labels: ["runbook", "database", "documentation"],
        assigneeIds: [docs._id],
        commentCount: 2,
        attachmentCount: 0,
      },
    ];

    for (const task of tasks) {
      const taskId = await ctx.db.insert("tasks", task);

      await ctx.db.insert("activities", {
        type: "task_created",
        agentId: chief._id,
        agentName: chief.name,
        taskId,
        taskTitle: task.title,
        message: `${chief.name} created task: ${task.title}`,
      });
    }

    return { message: `Seeded ${tasks.length} sample tasks` };
  },
});
