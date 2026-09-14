"use node";
/**
 * Convex wiring for the shared LLM router.
 *
 * Everything stateful (the token bucket, the daily budgets, the call log) lives
 * in the database, because a Convex action is a stateless isolate that may be
 * cold on every invocation. Module-level counters would reset silently and the
 * rate limiting would quietly stop working — the worst kind of bug, because
 * everything still appears to run.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { route } from "../packages/shared/llm/router";
import { callGemini } from "../packages/shared/llm/providers/gemini";
import { callGroq } from "../packages/shared/llm/providers/groq";
import type { ProviderName, RouterDeps } from "../packages/shared/llm/types";

export function buildDeps(ctx: ActionCtx): RouterDeps {
  return {
    takeToken: (provider) => ctx.runMutation(internal.rate.takeToken, { provider }),
    takeBudget: (botKey) => ctx.runMutation(internal.rate.takeBudget, { botKey }),
    logCall: async (entry) => {
      await ctx.runMutation(internal.rate.logLlmCall, entry);
    },
    apiKey: (provider: ProviderName) =>
      provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY,
    callGemini,
    callGroq,
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    random: () => Math.random(),
  };
}

/**
 * The call every bot makes. Returns raw text plus which provider actually
 * answered, so the caller can note a fallback in the activity feed.
 */
export const complete = action({
  args: {
    botKey: v.string(),
    purpose: v.string(),
    system: v.string(),
    user: v.string(),
    tier: v.optional(v.union(v.literal("reasoning"), v.literal("cheap"))),
    json: v.optional(v.boolean()),
    temperature: v.optional(v.number()),
    maxOutputTokens: v.optional(v.number()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Kill switch, checked at the top of the action rather than at schedule
    // time, so STOP takes effect on the next call and not the next cron tick.
    const halt = await ctx.runQuery(api.settings.haltState, {});
    if (halt.halted) {
      throw new Error(`STOP is engaged${halt.reason ? `: ${halt.reason}` : ""}. No LLM call was made.`);
    }
    return await route(buildDeps(ctx), args);
  },
});
