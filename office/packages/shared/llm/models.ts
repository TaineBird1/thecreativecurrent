import type { ProviderName, Tier } from "./types";

/**
 * Model choice per provider per tier.
 *
 * Gemini free tier is roughly 15 requests/minute and ~1,500 requests/day on
 * Flash. Flash-Lite has a higher allowance, which is why bulk work (qualifying
 * a hundred directory rows) is pointed at it and reasoning work is not.
 */
export const MODELS: Record<ProviderName, Record<Tier, string>> = {
  gemini: {
    reasoning: "gemini-2.5-flash",
    cheap: "gemini-2.5-flash-lite",
  },
  groq: {
    // Groq's free tier has one good large model; both tiers use it.
    reasoning: "llama-3.3-70b-versatile",
    cheap: "llama-3.1-8b-instant",
  },
};

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
