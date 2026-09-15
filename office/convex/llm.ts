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
import { MODELS } from "../packages/shared/llm/models";

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

/**
 * Ask each provider which of our model names it will actually answer to.
 *
 * Exists because a retired model ID returns a 404 that reads exactly like a
 * bad key, and there is no way to tell them apart without asking. The first
 * real run of this office died that way: both keys perfect, both model names
 * withdrawn, and the only symptom was "Both Gemini and Groq failed".
 *
 * Costs a handful of tiny requests against the daily allowance — a couple of
 * tokens each. It does not touch any bot's budget, because it is not a bot
 * doing work.
 */
export const probeModels = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ provider: string; model: string; ok: boolean; note: string }[]> => {
    const halt = await ctx.runQuery(api.settings.haltState, {});
    if (halt.halted) {
      return [{ provider: "—", model: "—", ok: false, note: "STOP is engaged; nothing was called." }];
    }

    const out: { provider: string; model: string; ok: boolean; note: string }[] = [];

    for (const provider of ["gemini", "groq"] as ProviderName[]) {
      const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
      if (!apiKey) {
        out.push({ provider, model: "—", ok: false, note: "No API key set in Convex." });
        continue;
      }

      const tried = new Set<string>();
      for (const tier of ["reasoning", "cheap"] as const) {
        for (const model of MODELS[provider][tier]) {
          if (tried.has(model)) continue;
          tried.add(model);
          try {
            const call = provider === "gemini" ? callGemini : callGroq;
            await call({
              system: "Answer with the single word OK.",
              user: "Say OK.",
              model,
              json: false,
              temperature: 0,
              maxOutputTokens: 16,
              apiKey,
            });
            out.push({ provider, model, ok: true, note: "answers" });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            out.push({ provider, model, ok: false, note: message.slice(0, 180) });
          }
        }
      }
    }
    return out;
  },
});
