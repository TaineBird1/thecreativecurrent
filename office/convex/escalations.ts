import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authedQuery, authedMutation } from "./lib/authed";
import { stamps, touch, alive } from "./lib/soft";

/** A bot asking for a human. Red badge on the desk, red badge in the Boss inbox. */
export const raise = internalMutation({
  args: {
    botKey: v.string(),
    title: v.string(),
    detail: v.string(),
    severity: v.union(v.literal("info"), v.literal("warn"), v.literal("urgent")),
  },
  handler: async (ctx, args) => {
    // Don't re-raise the same open escalation every cron tick.
    const open = alive(
      await ctx.db
        .query("escalations")
        .withIndex("by_bot", (q) => q.eq("botKey", args.botKey).eq("status", "open"))
        .collect(),
    );
    const duplicate = open.find((e) => e.title === args.title);
    if (duplicate) {
      await ctx.db.patch(duplicate._id, { detail: args.detail, ...touch() });
      return duplicate._id;
    }

    const id = await ctx.db.insert("escalations", { ...args, status: "open", ...stamps() });
    const bot = await ctx.db
      .query("bots")
      .withIndex("by_key", (q) => q.eq("key", args.botKey))
      .unique();
    if (bot && bot.status !== "off_shift" && args.severity !== "info") {
      await ctx.db.patch(bot._id, {
        status: "blocked",
        currentTask: args.title.slice(0, 60),
        lastError: args.detail,
        ...touch(),
      });
    }
    return id;
  },
});

export const open = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(
      await ctx.db.query("escalations").withIndex("by_status", (q) => q.eq("status", "open")).collect(),
    ).sort((a, b) => b.createdAt - a.createdAt),
});

export const openCount = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(
      await ctx.db.query("escalations").withIndex("by_status", (q) => q.eq("status", "open")).collect(),
    ).length,
});

export const resolve = authedMutation({
  args: { id: v.id("escalations"), note: v.optional(v.string()) },
  handler: async (ctx, { id, note }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Gone.");
    await ctx.db.patch(id, { status: "resolved", note, resolvedAt: Date.now(), ...touch() });

    const stillOpen = alive(
      await ctx.db
        .query("escalations")
        .withIndex("by_bot", (q) => q.eq("botKey", row.botKey).eq("status", "open"))
        .collect(),
    );
    if (stillOpen.length === 0) {
      const bot = await ctx.db
        .query("bots")
        .withIndex("by_key", (q) => q.eq("key", row.botKey))
        .unique();
      if (bot && bot.status === "blocked") {
        await ctx.db.patch(bot._id, {
          status: "idle",
          currentTask: "Unblocked",
          lastError: undefined,
          ...touch(),
        });
      }
    }
  },
});
