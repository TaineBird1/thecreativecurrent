import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, touch } from "./lib/soft";
import { sastDay } from "./lib/time";
import { RATE_LIMITS } from "../packages/shared/llm/models";
import { readSettings } from "./lib/settings";
import { BOTS } from "../packages/agents/registry";

/**
 * Token bucket, in the database.
 *
 * Convex mutations are serializable transactions, so read-modify-write here is
 * genuinely atomic — two bots asking for a token at the same millisecond cannot
 * both get the last one. That is the whole reason this is a mutation and not a
 * counter in module scope.
 */
export const takeToken = internalMutation({
  args: { provider: v.union(v.literal("gemini"), v.literal("groq")) },
  handler: async (ctx, { provider }) => {
    const cfg = RATE_LIMITS[provider];
    const key = `provider:${provider}`;
    const now = Date.now();
    const refillPerMs = cfg.refillPerMinute / 60_000;

    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!row) {
      await ctx.db.insert("rateLimits", {
        key,
        tokens: cfg.capacity - 1,
        count: 1,
        windowStart: now,
        lastRefillAt: now,
        ...stamps(),
      });
      return { ok: true, waitMs: 0 };
    }

    const elapsed = Math.max(0, now - row.lastRefillAt);
    const tokens = Math.min(cfg.capacity, row.tokens + elapsed * refillPerMs);

    if (tokens >= 1) {
      await ctx.db.patch(row._id, {
        tokens: tokens - 1,
        count: row.count + 1,
        lastRefillAt: now,
        ...touch(),
      });
      return { ok: true, waitMs: 0 };
    }

    // Not enough. Tell the caller exactly how long until one more drips in.
    await ctx.db.patch(row._id, { tokens, lastRefillAt: now, ...touch() });
    return { ok: false, waitMs: Math.ceil((1 - tokens) / refillPerMs) };
  },
});

/**
 * Per-bot daily request budget, counted in SAST days so it resets at local
 * midnight rather than 02:00.
 */
export const takeBudget = internalMutation({
  args: { botKey: v.string() },
  handler: async (ctx, { botKey }) => {
    const day = sastDay();
    const key = `budget:${botKey}:${day}`;

    const settings = await readSettings(ctx);
    const override = (settings?.budgets ?? {})[botKey];
    const limit =
      typeof override === "number"
        ? override
        : (BOTS.find((b) => b.key === botKey)?.dailyBudget ?? 50);

    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!row) {
      await ctx.db.insert("rateLimits", {
        key,
        tokens: 0,
        count: 1,
        windowStart: Date.now(),
        lastRefillAt: Date.now(),
        ...stamps(),
      });
      return { ok: true, used: 1, limit };
    }

    if (row.count >= limit) {
      // Mark the bot blocked with a reason you can read on its desk, rather
      // than letting it quietly do nothing for the rest of the day.
      const bot = await ctx.db
        .query("bots")
        .withIndex("by_key", (q) => q.eq("key", botKey))
        .unique();
      if (bot && bot.status !== "blocked" && bot.status !== "off_shift") {
        await ctx.db.patch(bot._id, {
          status: "blocked",
          currentTask: "Out of LLM budget today",
          lastError: `Used ${row.count}/${limit} requests. Resets at midnight SAST.`,
          ...touch(),
        });
      }
      return { ok: false, used: row.count, limit };
    }

    await ctx.db.patch(row._id, { count: row.count + 1, ...touch() });
    return { ok: true, used: row.count + 1, limit };
  },
});

export const logLlmCall = internalMutation({
  args: {
    botKey: v.string(),
    runId: v.optional(v.string()),
    purpose: v.string(),
    provider: v.union(v.literal("gemini"), v.literal("groq")),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    latencyMs: v.number(),
    attempt: v.number(),
    fellBack: v.boolean(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("rate_limited")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { runId, ...rest } = args;
    await ctx.db.insert("llmCalls", {
      ...rest,
      runId: runId ? (runId as never) : undefined,
      day: sastDay(),
      ...stamps(),
    });
  },
});

/** Budget usage per bot today. Drives the meter on each desk drawer. */
export const usageToday = authedQuery({
  args: {},
  handler: async (ctx) => {
    const day = sastDay();
    const settings = await readSettings(ctx);
    const rows = await Promise.all(
      BOTS.map(async (bot) => {
        const row = await ctx.db
          .query("rateLimits")
          .withIndex("by_key", (q) => q.eq("key", `budget:${bot.key}:${day}`))
          .unique();
        const override = (settings?.budgets ?? {})[bot.key];
        const limit = typeof override === "number" ? override : bot.dailyBudget;
        return { botKey: bot.key, used: row?.count ?? 0, limit };
      }),
    );
    const used = rows.reduce((n, r) => n + r.used, 0);
    const limit = rows.reduce((n, r) => n + r.limit, 0);
    return { day, perBot: rows, totalUsed: used, totalLimit: limit };
  },
});
