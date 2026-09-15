import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, alive } from "./lib/soft";

/** Every LLM call and every tool call, filterable by bot. */
export const llm = authedQuery({
  args: { botKey: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { botKey, limit }) => {
    const rows = alive(await ctx.db.query("llmCalls").order("desc").take((limit ?? 200) * 2));
    return (botKey ? rows.filter((r) => r.botKey === botKey) : rows).slice(0, limit ?? 200);
  },
});

export const tools = authedQuery({
  args: { botKey: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { botKey, limit }) => {
    const rows = alive(await ctx.db.query("toolCalls").order("desc").take((limit ?? 200) * 2));
    return (botKey ? rows.filter((r) => r.botKey === botKey) : rows).slice(0, limit ?? 200);
  },
});

export const recordToolCall = internalMutation({
  args: {
    botKey: v.string(),
    tool: v.string(),
    args: v.string(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("blocked")),
    durationMs: v.number(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("toolCalls", { ...args, ...stamps() });
  },
});

/** Totals for the Logs screen header. */
export const llmSummary = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("llmCalls").order("desc").take(1000));
    const ok = rows.filter((r) => r.status === "ok");
    return {
      calls: rows.length,
      ok: ok.length,
      errors: rows.filter((r) => r.status === "error").length,
      rateLimited: rows.filter((r) => r.status === "rate_limited").length,
      fallbacks: ok.filter((r) => r.fellBack).length,
      tokens: ok.reduce((n, r) => n + r.totalTokens, 0),
      avgLatencyMs: ok.length ? Math.round(ok.reduce((n, r) => n + r.latencyMs, 0) / ok.length) : 0,
    };
  },
});
