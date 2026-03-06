import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const optionalJson = v.optional(v.any());

export const upsertHealth = mutation({
  args: {
    key: v.optional(v.string()),
    paraRoot: v.string(),
    enabled: v.boolean(),
    shadowMode: v.optional(v.boolean()),
    qmdAvailable: v.optional(v.boolean()),
    qmdBin: v.optional(v.string()),
    qmdCollections: v.optional(v.array(v.string())),
    entities: v.optional(v.number()),
    facts: v.optional(v.number()),
    lastBootstrapAt: v.optional(v.number()),
    lastExtractAt: v.optional(v.number()),
    lastSynthesisAt: v.optional(v.number()),
    lastQmdUpdateAt: v.optional(v.number()),
    lastQmdEmbedAt: v.optional(v.number()),
    checkpoint: optionalJson,
    metrics: optionalJson,
    lastExtractStats: optionalJson,
    lastSynthesisStats: optionalJson,
    bootstrapReport: optionalJson,
  },
  handler: async (ctx, args) => {
    const key = String(args.key || "primary").trim() || "primary";
    const existing = await ctx.db
      .query("pkmState")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    const next = {
      key,
      paraRoot: args.paraRoot,
      enabled: args.enabled,
      shadowMode: args.shadowMode ?? existing?.shadowMode,
      qmdAvailable: args.qmdAvailable ?? existing?.qmdAvailable,
      qmdBin: args.qmdBin ?? existing?.qmdBin,
      qmdCollections: args.qmdCollections ?? existing?.qmdCollections,
      entities: args.entities ?? existing?.entities,
      facts: args.facts ?? existing?.facts,
      lastBootstrapAt: args.lastBootstrapAt ?? existing?.lastBootstrapAt,
      lastExtractAt: args.lastExtractAt ?? existing?.lastExtractAt,
      lastSynthesisAt: args.lastSynthesisAt ?? existing?.lastSynthesisAt,
      lastQmdUpdateAt: args.lastQmdUpdateAt ?? existing?.lastQmdUpdateAt,
      lastQmdEmbedAt: args.lastQmdEmbedAt ?? existing?.lastQmdEmbedAt,
      checkpoint: args.checkpoint ?? existing?.checkpoint,
      metrics: args.metrics ?? existing?.metrics,
      lastExtractStats: args.lastExtractStats ?? existing?.lastExtractStats,
      lastSynthesisStats: args.lastSynthesisStats ?? existing?.lastSynthesisStats,
      bootstrapReport: args.bootstrapReport ?? existing?.bootstrapReport,
      updatedAt: Date.now(),
    };

    if (existing?._id) {
      await ctx.db.patch(existing._id, next);
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("pkmState", next);
    return await ctx.db.get(id);
  },
});

export const getHealth = query({
  args: {
    key: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const key = String(args.key || "primary").trim() || "primary";
    const now = Number(args.now || Date.now());
    const record = await ctx.db
      .query("pkmState")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!record) {
      return {
        key,
        exists: false,
        extractionLagMs: null,
        synthesisLagMs: null,
        qmdIndexLagMs: null,
      };
    }

    const extractionLagMs =
      typeof record.lastExtractAt === "number" ? Math.max(0, now - record.lastExtractAt) : null;
    const synthesisLagMs =
      typeof record.lastSynthesisAt === "number" ? Math.max(0, now - record.lastSynthesisAt) : null;
    const qmdFreshAt =
      typeof record.lastQmdUpdateAt === "number"
        ? record.lastQmdUpdateAt
        : typeof record.lastQmdEmbedAt === "number"
          ? record.lastQmdEmbedAt
          : null;
    const qmdIndexLagMs = typeof qmdFreshAt === "number" ? Math.max(0, now - qmdFreshAt) : null;

    return {
      ...record,
      exists: true,
      extractionLagMs,
      synthesisLagMs,
      qmdIndexLagMs,
      indexFreshAt: qmdFreshAt,
    };
  },
});
