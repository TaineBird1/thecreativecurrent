/**
 * Recognising errors that have crossed a Convex action boundary.
 *
 * The strings here are copied from real escalations in the Boss inbox, because
 * that is where the bug showed itself: rate limiting reported as a crash,
 * escalated as a decision Taine could not make, and counted as a task failure
 * — all because withRun compared `err.name`, which `ctx.runAction` had already
 * thrown away.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { errorIsNamed } = await loadTs("packages/shared/errors.ts");

// Verbatim from the inbox.
const RATE_LIMITED =
  "Uncaught AllProvidersRateLimitedError: Both Gemini and Groq are rate limited right now. " +
  "gemini gemini-3.5-flash attempt 1: gemini returned 429 | groq openai/gpt-oss-120b attempt 1: " +
  "groq returned 429 at async handler [as handler] (../convex/llm.ts:55:11)";

const REAL_OUTAGE =
  "Uncaught AllProvidersFailedError: Both Gemini and Groq failed. gemini gemini-3.5-flash " +
  'attempt 1: Gemini 503: { "error": { "code": 503, "message": "This model is currently ' +
  'experiencing high demand." } }';

test("a name that survived only in the message is still recognised", () => {
  // The class and err.name are gone by the time this reaches withRun — only
  // the text remains.
  const crossed = new Error(RATE_LIMITED);
  assert.equal(crossed.name, "Error", "precondition: the class really is lost");
  assert.equal(errorIsNamed(crossed, "AllProvidersRateLimitedError"), true);
});

test("the two provider failures are never confused for each other", () => {
  // One is "wait, the free tier is busy"; the other is "something is broken".
  // They lead to opposite handling, and one name contains most of the other.
  assert.equal(errorIsNamed(new Error(REAL_OUTAGE), "AllProvidersFailedError"), true);
  assert.equal(errorIsNamed(new Error(REAL_OUTAGE), "AllProvidersRateLimitedError"), false);
  assert.equal(errorIsNamed(new Error(RATE_LIMITED), "AllProvidersFailedError"), false);
});

test("a real class still matches by name", () => {
  const err = new Error("out of budget");
  err.name = "BudgetExceededError";
  assert.equal(errorIsNamed(err, "BudgetExceededError"), true);
});

test("an ordinary error matches nothing", () => {
  for (const err of [
    new Error("Something else went wrong"),
    new Error(""),
    "a thrown string",
    null,
    undefined,
  ]) {
    assert.equal(errorIsNamed(err, "BudgetExceededError"), false);
    assert.equal(errorIsNamed(err, "AllProvidersRateLimitedError"), false);
  }
});

test("a name mentioned in passing does not count as a partial word", () => {
  // Guarding the word boundary: a longer name must not match a shorter one.
  assert.equal(errorIsNamed(new Error("HaltedErrorLike: no"), "HaltedError"), false);
  assert.equal(errorIsNamed(new Error("Uncaught HaltedError: STOP"), "HaltedError"), true);
});
