import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, touch, alive } from "./lib/soft";

export const start = internalMutation({
  args: {
    botKey: v.string(),
    trigger: v.union(
      v.literal("cron"),
      v.literal("manual"),
      v.literal("orchestrator"),
      v.literal("chat"),
    ),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("runs", {
      ...args,
      status: "running" as const,
      startedAt: Date.now(),
      ...stamps(),
    }),
});

export const finish = internalMutation({
  args: {
    id: v.id("runs"),
    status: v.union(
      v.literal("ok"),
      v.literal("error"),
      v.literal("halted"),
      v.literal("budget_exceeded"),
    ),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, summary, error }) => {
    await ctx.db.patch(id, { status, summary, error, finishedAt: Date.now(), ...touch() });
  },
});

export const recentForBot = authedQuery({
  args: { botKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { botKey, limit }) =>
    alive(
      await ctx.db.query("runs").withIndex("by_bot", (q) => q.eq("botKey", botKey)).order("desc").take(limit ?? 50),
    ),
});

export const recent = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => alive(await ctx.db.query("runs").order("desc").take(limit ?? 100)),
});
