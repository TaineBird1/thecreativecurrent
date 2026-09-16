/**
 * Recognising an error that has crossed a Convex action boundary.
 *
 * `ctx.runAction` does not hand back the object that was thrown. It serialises
 * it, so the class is gone and `err.name` is plain "Error" — the original name
 * survives only inside the message, as "Uncaught AllProvidersRateLimitedError:
 * Both Gemini and Groq are rate limited right now."
 *
 * Every bot's model call goes through `think()` -> `ctx.runAction(api.llm...)`,
 * so every interesting error arrives that way: out of budget, both providers
 * rate limited, STOP engaged. withRun checked `err.name` against those, which
 * meant none of the three branches ever ran. Rate limiting was reported as a
 * crash, escalated to the Boss inbox, and counted as a task failure — the exact
 * behaviour that was supposedly fixed earlier the same day, quietly not in
 * effect.
 *
 * Checking the message as well as the name is the fix. It looks loose, and is:
 * the alternative is a ConvexError carrying a structured payload, which is the
 * right long-term answer and a larger change than the bug deserves today.
 */
export function errorIsNamed(err: unknown, name: string): boolean {
  if (err instanceof Error && err.name === name) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  // Anchored to a word boundary so "AllProvidersFailedError" never matches
  // "AllProvidersRateLimitedError" or the other way round.
  return new RegExp(`\\b${name}\\b`).test(message);
}
