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

        // Do not burn the remaining attempts on a provider that just told us to
        // go away. For Gemini this is the case the whole fallback exists for;
        // for Groq the same logic applies and did not use to — it retried three
        // times in a row, all three came back 429, and the only thing those two
        // extra calls bought was a deeper hole in an already-spent quota.
        //
        // A Retry-After short enough to be worth waiting out is the exception,
        // since that is the provider telling us exactly when it will say yes.
        if (rateLimited) {
          const retryAfterMs = (err as RateLimitedError).retryAfterMs;
          if (!retryAfterMs || retryAfterMs > MAX_BUCKET_WAIT_MS) break;
        }

        // A 4xx that is not a 429 will not fix itself on retry.
        if (!rateLimited && /\b4\d\d\b/.test(message) && !/\b429\b/.test(message)) break;

        if (attempt < MAX_ATTEMPTS_PER_PROVIDER) {
          await deps.sleep(backoffMs(attempt, deps.random(), (err as RateLimitedError).retryAfterMs));
        }
      }
    }
  }

  // Everything refused, but "everything is busy" and "everything is broken"
  // are different situations and the bot should say which one it met.
  const everyFailureWasRateLimiting =
    failures.length > 0 && failures.every((f) => /\b429\b|rate limit/i.test(f));
  throw new AllProvidersFailedError(failures.join(" | "), everyFailureWasRateLimiting);
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
 *
 * What it deliberately does NOT do is repair a truncated reply. A reply that
 * ran out of output budget is half an email, and half an email stitched back
 * together is worse than none — it would read as finished and go to a real
 * prospect. So truncation fails, and says plainly that it was truncated: the
 * first time this happened the error blamed JSON formatting and sent us
 * looking at the parser instead of at maxOutputTokens.
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
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fall through to the diagnosis below */
      }
    }
    if (looksTruncated(cleaned)) {
      throw new Error(
        `The model's reply was cut off before it finished — it ran out of output budget. ` +
          `Raise maxOutputTokens for this call. Got ${cleaned.length} characters ending: ` +
          `"…${cleaned.slice(-80)}"`,
      );
    }
    throw new Error(`Model did not return JSON. Got: ${text.slice(0, 200)}`);
  }
}

/** An opening brace with no partner, or a string left hanging open. */
function looksTruncated(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    else if (!inString && (ch === "{" || ch === "[")) depth++;
    else if (!inString && (ch === "}" || ch === "]")) depth--;
  }
  return depth > 0 || inString;
}
