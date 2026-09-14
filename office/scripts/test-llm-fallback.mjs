/**
 * Proves the Gemini -> Groq fallback works, without spending a single real
 * request of anyone's free quota.
 *
 * The router takes all of its outside world through an injected `deps` object
 * precisely so this is possible: we hand it fake providers that fail on demand
 * and a fake clock, then assert on what it did.
 *
 * Run: pnpm test:llm
 */
import { strict as assert } from "node:assert";

// The router is TypeScript. Node cannot import it directly, so this script
// compiles the two files it needs on the fly with the TS compiler that is
// already a dev dependency. No extra tooling, no build step to remember.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "tcc-llm-"));

function compile(relPath, outName) {
  const src = readFileSync(join(root, relPath), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const file = join(out, outName);
  writeFileSync(file, js);
  return pathToFileURL(file).href;
}

// models.ts and types.ts are imported by router.ts with extensionless
// specifiers; rewrite those to the compiled filenames.
for (const [rel, name] of [
  ["packages/shared/llm/types.ts", "types.js"],
  ["packages/shared/llm/models.ts", "models.js"],
]) {
  compile(rel, name);
}
const routerSrc = readFileSync(join(root, "packages/shared/llm/router.ts"), "utf8")
  .replace(/from "\.\/types"/g, 'from "./types.js"')
  .replace(/from "\.\/models"/g, 'from "./models.js"');
const routerJs = ts.transpileModule(routerSrc, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
writeFileSync(join(out, "router.js"), routerJs);
// models.js imports types.js for a type only; strip the specifier rewrite need.
writeFileSync(
  join(out, "models.js"),
  readFileSync(join(out, "models.js"), "utf8").replace(/from "\.\/types"/g, 'from "./types.js"'),
);

const { route, backoffMs, parseJson } = await import(pathToFileURL(join(out, "router.js")).href);
const { RateLimitedError } = await import(pathToFileURL(join(out, "types.js")).href);

// ── Test harness ────────────────────────────────────────────────────────────
function makeDeps(overrides = {}) {
  const logs = [];
  const sleeps = [];
  let clock = 1_700_000_000_000;
  return {
    logs,
    sleeps,
    deps: {
      takeToken: async () => ({ ok: true, waitMs: 0 }),
      takeBudget: async () => ({ ok: true, used: 1, limit: 100 }),
      logCall: async (e) => void logs.push(e),
      apiKey: (p) => (p === "gemini" ? "fake-gemini-key" : "fake-groq-key"),
      callGemini: async () => ({ text: '{"from":"gemini"}', promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
      callGroq: async () => ({ text: '{"from":"groq"}', promptTokens: 12, completionTokens: 6, totalTokens: 18 }),
      sleep: async (ms) => { sleeps.push(ms); clock += ms; },
      now: () => (clock += 1),
      random: () => 0.5,
      ...overrides,
    },
  };
}

const req = {
  botKey: "outreach",
  purpose: "test_fallback",
  system: "You are a test.",
  user: "Return JSON.",
};

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}\n        ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\nLLM router — Gemini -> Groq fallback\n");

await test("happy path uses Gemini and does not fall back", async () => {
  const { deps, logs } = makeDeps();
  const r = await route(deps, req);
  assert.equal(r.provider, "gemini");
  assert.equal(r.fellBack, false);
  assert.equal(r.model, "gemini-2.5-flash");
  assert.equal(logs.filter((l) => l.status === "ok").length, 1);
});

await test("429 from Gemini falls straight over to Groq", async () => {
  const { deps, logs } = makeDeps({
    callGemini: async () => { throw new RateLimitedError("gemini"); },
  });
  const r = await route(deps, req);
  assert.equal(r.provider, "groq", "expected Groq to answer");
  assert.equal(r.fellBack, true, "expected fellBack to be flagged");
  assert.equal(parseJson(r.text).from, "groq");

  // The point of the fallback is not to keep hammering a provider that just
  // said no. One Gemini attempt, then hand over.
  const geminiAttempts = logs.filter((l) => l.provider === "gemini").length;
  assert.equal(geminiAttempts, 1, `expected 1 Gemini attempt, got ${geminiAttempts}`);
  assert.equal(logs.filter((l) => l.provider === "gemini")[0].status, "rate_limited");
});

await test("transient Gemini 5xx retries, then succeeds on Gemini", async () => {
  let n = 0;
  const { deps, sleeps } = makeDeps({
    callGemini: async () => {
      if (++n === 1) throw new Error("Gemini 503: backend overloaded");
      return { text: '{"from":"gemini"}', promptTokens: 1, completionTokens: 1, totalTokens: 2 };
    },
  });
  const r = await route(deps, req);
  assert.equal(r.provider, "gemini");
  assert.equal(n, 2, "should have retried once");
  assert.equal(sleeps.length, 1, "should have backed off exactly once");
});

await test("a 400 is not retried — it will never fix itself", async () => {
  let n = 0;
  const { deps } = makeDeps({
    callGemini: async () => { n++; throw new Error("Gemini 400: invalid argument"); },
  });
  const r = await route(deps, req);
  assert.equal(n, 1, `expected no retry on 400, got ${n} attempts`);
  assert.equal(r.provider, "groq");
});

await test("missing Gemini key falls back instead of crashing", async () => {
  const { deps, logs } = makeDeps({ apiKey: (p) => (p === "groq" ? "fake" : undefined) });
  const r = await route(deps, req);
  assert.equal(r.provider, "groq");
  assert.ok(logs.some((l) => l.error === "no API key configured"));
});

await test("both providers down throws AllProvidersFailedError, and every attempt is logged", async () => {
  const { deps, logs } = makeDeps({
    callGemini: async () => { throw new Error("Gemini 503"); },
    callGroq: async () => { throw new Error("Groq 503"); },
  });
  await assert.rejects(() => route(deps, req), /Both Gemini and Groq failed/);
  assert.equal(logs.length, 6, `expected 3 + 3 logged attempts, got ${logs.length}`);
  assert.ok(logs.every((l) => l.status === "error"));
});

await test("daily budget is checked before any network call", async () => {
  let called = false;
  const { deps } = makeDeps({
    takeBudget: async () => ({ ok: false, used: 300, limit: 300 }),
    callGemini: async () => { called = true; throw new Error("should never run"); },
  });
  await assert.rejects(() => route(deps, req), /used its whole daily LLM budget/);
  assert.equal(called, false, "an over-budget bot must cost nothing at all");
});

await test("token bucket exhaustion moves to the next provider rather than stalling", async () => {
  const { deps, logs } = makeDeps({
    takeToken: async (p) => (p === "gemini" ? { ok: false, waitMs: 60_000 } : { ok: true, waitMs: 0 }),
  });
  const r = await route(deps, req);
  assert.equal(r.provider, "groq");
  assert.ok(logs.some((l) => l.provider === "gemini" && l.status === "rate_limited"));
});

await test("cheap tier picks the lite model", async () => {
  const { deps } = makeDeps();
  const r = await route(deps, { ...req, tier: "cheap" });
  assert.equal(r.model, "gemini-2.5-flash-lite");
});

await test("backoff is exponential, jittered, and honours Retry-After", async () => {
  assert.equal(backoffMs(1, 1.0), 800);
  assert.equal(backoffMs(2, 1.0), 1600);
  assert.equal(backoffMs(3, 1.0), 3200);
  assert.equal(backoffMs(3, 0.0), 0, "full jitter means the floor is 0");
  assert.equal(backoffMs(1, 1.0, 5000), 5000, "Retry-After wins when given");
  assert.equal(backoffMs(9, 1.0), 20_000, "capped");
});

await test("parseJson survives a markdown fence and a chatty preamble", () => {
  assert.equal(parseJson('```json\n{"a":1}\n```').a, 1);
  assert.equal(parseJson('Sure! Here you go:\n{"a":2}').a, 2);
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}\n`);
