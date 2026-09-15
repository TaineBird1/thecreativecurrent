export type ProviderName = "gemini" | "groq";

/** Reasoning work vs cheap bulk work. Maps to a different model per provider. */
export type Tier = "reasoning" | "cheap";

export interface LlmRequest {
  botKey: string;
  /** Short verb_noun label. Shows up in the Logs screen and is how you spot a runaway bot. */
  purpose: string;
  system: string;
  user: string;
  tier?: Tier;
  /** Ask for a JSON object back. Every bot prompt in this app does. */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  runId?: string;
}

export interface LlmResult {
  text: string;
  provider: ProviderName;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  attempts: number;
  /** True when Gemini refused (429/5xx/no key) and Groq answered instead. */
  fellBack: boolean;
}

export class BudgetExceededError extends Error {
  constructor(
    public botKey: string,
    public used: number,
    public limit: number,
  ) {
    super(
      `${botKey} has used its whole daily LLM budget (${used}/${limit}). It will start again tomorrow, or you can raise the budget in Settings.`,
    );
    this.name = "BudgetExceededError";
  }
}

export class AllProvidersFailedError extends Error {
  constructor(
    public detail: string,
    /**
     * True when every provider refused with a 429 rather than breaking.
     *
     * Worth distinguishing because the two need opposite responses. A real
     * failure is a bug to look at; running out of free quota is Tuesday — it
     * fixes itself when the window resets, and reporting it as a crash puts the
     * bot in a red error state, raises an escalation, and fails the task, none
     * of which is true or useful.
     */
    public rateLimited = false,
  ) {
    super(
      rateLimited
        ? `Both Gemini and Groq are rate limited right now. ${detail}`
        : `Both Gemini and Groq failed. ${detail}`,
    );
    this.name = rateLimited ? "AllProvidersRateLimitedError" : "AllProvidersFailedError";
  }
}

/** Thrown by a provider when it is rate limited. The router treats this specially. */
export class RateLimitedError extends Error {
  constructor(
    public provider: ProviderName,
    public retryAfterMs?: number,
  ) {
    super(`${provider} returned 429`);
    this.name = "RateLimitedError";
  }
}

export interface ProviderCall {
  (req: {
    system: string;
    user: string;
    model: string;
    json: boolean;
    temperature: number;
    maxOutputTokens: number;
    apiKey: string;
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
}

/**
 * Everything the router needs from the outside world. Injected rather than
 * imported so the fallback test can substitute fakes and prove the behaviour
 * without spending real quota.
 */
export interface RouterDeps {
  /** Shared token bucket. Returns how long to wait, 0 if a token was taken. */
  takeToken(provider: ProviderName): Promise<{ ok: boolean; waitMs: number }>;
  /** Per-bot daily request budget. */
  takeBudget(botKey: string): Promise<{ ok: boolean; used: number; limit: number }>;
  logCall(entry: {
    botKey: string;
    runId?: string;
    purpose: string;
    provider: ProviderName;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    attempt: number;
    fellBack: boolean;
    status: "ok" | "error" | "rate_limited";
    error?: string;
  }): Promise<void>;
  apiKey(provider: ProviderName): string | undefined;
  callGemini: ProviderCall;
  callGroq: ProviderCall;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** 0..1. Injectable so the backoff jitter is deterministic under test. */
  random(): number;
}
