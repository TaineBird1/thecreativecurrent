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
 * Ask each provider what models it actually has.
 *
 * Exists because I guessed model names wrong twice in a row. A retired name
 * returns a 404 that reads exactly like a bad key, so the first failure sent
 * us looking at credentials that were perfect; the second was me substituting
 * one guess for another. Both providers publish a list endpoint, it costs no
 * tokens, and it ends the argument.
 *
 * Returns what each provider offers, which of our configured names survive
 * in that list, and — when none do — enough for a human to pick the
 * replacement from real names rather than from memory.
 */
export const listModels = action({
  args: {},
  handler: async (): Promise<
    {
      provider: string;
      available: string[];
      configured: string[];
      usable: string[];
      error?: string;
    }[]
  > => {
    const out: {
      provider: string;
      available: string[];
      configured: string[];
      usable: string[];
      error?: string;
    }[] = [];

    for (const provider of ["gemini", "groq"] as ProviderName[]) {
      const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
      const configured = [
        ...new Set([...MODELS[provider].reasoning, ...MODELS[provider].cheap]),
      ];

      if (!apiKey) {
        out.push({ provider, available: [], configured, usable: [], error: "No API key set in Convex." });
        continue;
      }

      try {
        let available: string[] = [];

        if (provider === "gemini") {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
          );
          if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
          const data = (await res.json()) as {
            models?: { name?: string; supportedGenerationMethods?: string[] }[];
          };
          available = (data.models ?? [])
            // Only models we could actually send a prompt to.
            .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
            .map((m) => (m.name ?? "").replace(/^models\//, ""))
            .filter(Boolean);
        } else {
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
          const data = (await res.json()) as { data?: { id?: string }[] };
          available = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
        }

        available.sort();
        out.push({
          provider,
          available,
          configured,
          usable: configured.filter((m) => available.includes(m)),
        });
      } catch (err) {
        out.push({
          provider,
          available: [],
          configured,
          usable: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return out;
  },
});
