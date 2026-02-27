import { mutation } from "./_generated/server";
import { v } from "convex/values";

const CONFIRM_TOKEN = "CLEAR_MISSION_CONTROL_RUNTIME_DATA";

export const clearMissionControlRuntimeData = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, args) => {
    if (args.confirm !== CONFIRM_TOKEN) {
      throw new Error("Invalid confirmation token");
    }

    const deleted: Record<string, number> = {
      tasks: 0,
      messages: 0,
      activities: 0,
      documents: 0,
      notifications: 0,
      chatMessages: 0,
      telegramIntakeEvents: 0,
      taskReviews: 0,
      automationRuns: 0,
    };

    const tables = Object.keys(deleted) as Array<keyof typeof deleted>;
    for (const table of tables) {
      const rows = await (ctx.db.query as any)(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deleted[table] = rows.length;
    }

    const agents = await ctx.db.query("agents").collect();
    let agentsReset = 0;
    for (const agent of agents) {
      await ctx.db.patch(agent._id, {
        currentTaskId: undefined,
        status: agent.name === "Peter" ? "idle" : "active",
      });
      agentsReset += 1;
    }

    return {
      ok: true,
      deleted,
      agentsKept: agents.length,
      agentsReset,
    };
  },
});
