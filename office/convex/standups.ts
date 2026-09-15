import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, touch, alive } from "./lib/soft";

export const save = internalMutation({
  args: {
    forDate: v.string(),
    yesterday: v.string(),
    today: v.string(),
    needsYou: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("standups")
      .withIndex("by_date", (q) => q.eq("forDate", args.forDate))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, ...touch() });
      return existing._id;
    }
    return await ctx.db.insert("standups", { ...args, ...stamps() });
  },
});

export const latest = authedQuery({
  args: {},
  handler: async (ctx) => alive(await ctx.db.query("standups").order("desc").take(1))[0] ?? null,
});

export const recent = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    alive(await ctx.db.query("standups").order("desc").take(limit ?? 14)),
});
