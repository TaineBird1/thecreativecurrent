import type { ProviderName, Tier } from "./types";

/**
 * Model choice per provider per tier, as an ordered fallback chain.
 *
 * Chains rather than single names because providers retire model IDs without
 * warning and a retired ID is a 404, which looks exactly like a broken key
 * unless you read the body. That happened on the first real run: both tiers
 * were pointing at models that had been withdrawn, so every call failed with
 * "Both Gemini and Groq failed" while the keys were perfectly good.
 *
 * The router walks the chain on a model-not-found error before giving up on a
 * provider, so a retirement costs one wasted round trip instead of an outage.
 * Settings has a "check models" button that reports which of these your key
 * can actually reach — run it if the office starts failing for no clear reason.
 *
 * Gemini's free tier is roughly 15 requests/minute and ~1,500/day on Flash.
 * Flash-Lite has a larger allowance, which is why bulk work (qualifying a
 * hundred directory rows) points at it and reasoning work does not.
 */
export const MODELS: Record<ProviderName, Record<Tier, string[]>> = {
  gemini: {
    reasoning: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest"],
    cheap: ["gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"],
  },
  groq: {
    // Groq's free tier has one dependable large model. Both tiers use it: the
    // small ones get withdrawn constantly and Groq is the fallback anyway, so
    // paying a little more latency beats another 404.
    reasoning: ["llama-3.3-70b-versatile"],
    cheap: ["llama-3.3-70b-versatile"],
  },
};

/** The one currently in use, for logging and for the UI. */
export function firstModel(provider: ProviderName, tier: Tier): string {
  return MODELS[provider][tier][0];
}

/**
 * True when a failure means "that model name is wrong", as opposed to anything
 * else. Worth being generous: every provider words it differently and the cost
 * of a false positive is trying the next name in the chain.
 */
export function isModelUnavailable(message: string): boolean {
  return (
    /model_not_found|models\/[\w.-]+ is not found|is no longer available|does not exist|not supported for|NOT_FOUND/i.test(
      message,
    ) || (/\b404\b/.test(message) && /model/i.test(message))
  );
}

/** Requests per minute, shared across all nine bots. */
export const RATE_LIMITS: Record<ProviderName, { capacity: number; refillPerMinute: number }> = {
  // 15 rpm is the documented free-tier ceiling. We run at 12 to leave room for
  // the retry that follows a 429 — running at exactly the limit guarantees one.
  gemini: { capacity: 12, refillPerMinute: 12 },
  groq: { capacity: 25, refillPerMinute: 25 },
};

export const MAX_ATTEMPTS_PER_PROVIDER = 3;
export const BASE_BACKOFF_MS = 800;
export const MAX_BACKOFF_MS = 20_000;
/** Longest we will sit waiting for a token before giving up and falling over. */
export const MAX_BUCKET_WAIT_MS = 15_000;
