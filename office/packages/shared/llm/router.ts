import {
  AllProvidersFailedError,
  BudgetExceededError,
  RateLimitedError,
  type LlmRequest,
  type LlmResult,
  type ProviderName,
  type RouterDeps,
} from "./types";
import {
  BASE_BACKOFF_MS,
  isModelUnavailable,
  MAX_ATTEMPTS_PER_PROVIDER,
  MAX_BACKOFF_MS,
  MAX_BUCKET_WAIT_MS,
  MODELS,
} from "./models";

/**
 * The one place an LLM call happens.
 *
 * Order of operations, and the reason for each:
 *
 *   1. Daily budget  — a runaway bot must not eat the whole office's free quota.
 *                      Checked first, before any network work, so an over-budget
 *                      bot costs nothing at all.
 *   2. Token bucket  — 15 rpm across nine bots is the real constraint. Shared
 *                      state in the DB, because actions are stateless isolates.
 *   3. Gemini        — up to 3 attempts, exponential backoff with full jitter.
 *   4. Groq          — same, on any Gemini failure including "no key configured".
 *   5. Log           — every attempt, success or failure, always.
 *
 * Every path through this function logs. A call that does not appear in the
 * Logs screen did not happen.
 */
export async function route(deps: RouterDeps, req: LlmRequest): Promise<LlmResult> {
  const tier = req.tier ?? "reasoning";
  const json = req.json ?? true;
  const temperature = req.temperature ?? 0.7;
  const maxOutputTokens = req.maxOutputTokens ?? 2048;

  const budget = await deps.takeBudget(req.botKey);
  if (!budget.ok) throw new BudgetExceededError(req.botKey, budget.used, budget.limit);

  const failures: string[] = [];
  let attemptCounter = 0;

  const order: ProviderName[] = ["gemini", "groq"];

  for (const provider of order) {
    const fellBack = provider !== "gemini";
    const key = deps.apiKey(provider);

    const chain = MODELS[provider][tier];
    let modelIndex = 0;

    if (!key) {
      failures.push(`${provider}: no API key configured`);
      await deps.logCall({
        botKey: req.botKey,
        runId: req.runId,
        purpose: req.purpose,
        provider,
        model: chain[0],
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        attempt: 0,
        fellBack,
        status: "error",
        error: "no API key configured",
      });
      continue;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      attemptCounter++;

      // Wait for a token rather than firing and eating a guaranteed 429.
      const waited = await waitForToken(deps, provider);
      if (!waited) {
        failures.push(`${provider}: no rate-limit token within ${MAX_BUCKET_WAIT_MS}ms`);
        await deps.logCall({
          botKey: req.botKey,
          runId: req.runId,
          purpose: req.purpose,
          provider,
          model: chain[modelIndex],
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: 0,
          attempt,
          fellBack,
          status: "rate_limited",
          error: "local token bucket exhausted",
        });
        break; // move to the next provider; waiting longer helps nobody
      }

      const model = chain[modelIndex];
      const started = deps.now();
      try {
        const call = provider === "gemini" ? deps.callGemini : deps.callGroq;
        const out = await call({
          system: req.system,
          user: req.user,
          model,
          json,
          temperature,
          maxOutputTokens,
          apiKey: key,
        });
        const latencyMs = deps.now() - started;

        await deps.logCall({
          botKey: req.botKey,
          runId: req.runId,
          purpose: req.purpose,
          provider,
          model,
          promptTokens: out.promptTokens,
          completionTokens: out.completionTokens,
          totalTokens: out.totalTokens,
          latencyMs,
          attempt,
          fellBack,
          status: "ok",
        });

        return {
          text: out.text,
          provider,
          model,
          promptTokens: out.promptTokens,
          completionTokens: out.completionTokens,
          totalTokens: out.totalTokens,
          latencyMs,
          attempts: attemptCounter,
          fellBack,
        };
      } catch (err) {
        const latencyMs = deps.now() - started;
        const rateLimited = err instanceof RateLimitedError;
        const message = err instanceof Error ? err.message : String(err);

        await deps.logCall({
          botKey: req.botKey,
          runId: req.runId,
          purpose: req.purpose,
          provider,
          model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
          attempt,
          fellBack,
          status: rateLimited ? "rate_limited" : "error",
          error: message,
        });

        failures.push(`${provider} ${model} attempt ${attempt}: ${message}`);

        // A retired model id is not a provider failure — it is the wrong name.
        // Walk the chain before writing the provider off, and don't spend one
        // of its attempts doing it: nothing was wrong with the request.
        if (isModelUnavailable(message) && modelIndex + 1 < chain.length) {
          modelIndex++;
          attempt--;
          continue;
        }

        // A 429 from Gemini is exactly the case the whole fallback exists for.
        // Do not burn the remaining attempts on a provider that just told us to
        // go away — hand straight over to Groq.
        if (rateLimited && provider === "gemini") break;

        // A 4xx that is not a 429 will not fix itself on retry.
        if (!rateLimited && /\b4\d\d\b/.test(message) && !/\b429\b/.test(message)) break;

        if (attempt < MAX_ATTEMPTS_PER_PROVIDER) {
          await deps.sleep(backoffMs(attempt, deps.random(), (err as RateLimitedError).retryAfterMs));
        }
      }
    }
  }

  throw new AllProvidersFailedError(failures.join(" | "));
}

/** Exponential backoff with full jitter, honouring Retry-After when given. */
export function backoffMs(attempt: number, random: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, MAX_BACKOFF_MS);
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  // Full jitter (AWS's formulation): random between 0 and the ceiling. Nine bots
  // backing off in lockstep would just collide again at the same moment.
  return Math.floor(random * ceiling);
}

async function waitForToken(deps: RouterDeps, provider: ProviderName): Promise<boolean> {
  const deadline = deps.now() + MAX_BUCKET_WAIT_MS;
  for (;;) {
    const { ok, waitMs } = await deps.takeToken(provider);
    if (ok) return true;
    const wait = Math.max(50, Math.min(waitMs, 2_000));
    if (deps.now() + wait > deadline) return false;
    await deps.sleep(wait);
  }
}

/**
 * Bots are told to return JSON. Models sometimes wrap it in a ```json fence or
 * add a sentence of preamble anyway. Recover what we can rather than failing a
 * whole run over punctuation.
 */
export function parseJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error(`Model did not return JSON. Got: ${text.slice(0, 200)}`);
  }
}
