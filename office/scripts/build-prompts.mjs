/**
 * Compiles packages/agents/<bot>/prompt.md into one TS module the Convex
 * bundler can import. Convex cannot import markdown, but the .md files need to
 * stay the real, editable source of truth — so we generate instead of inlining.
 *
 * {{CONTEXT}} in any prompt is replaced with packages/agents/context.md, so the
 * shared business context lives in exactly one place.
 *
 * Run: pnpm prompts:build   (also runs automatically before build and deploy)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = join(root, "packages", "agents");

const BOT_KEYS = [
  "orchestrator", "strategy", "leadgen", "outreach", "proposal",
  "content", "seo", "design", "clientsuccess",
];

const context = readFileSync(join(agentsDir, "context.md"), "utf8").trim();

const entries = BOT_KEYS.map((key) => {
  const path = join(agentsDir, key, "prompt.md");
  if (!existsSync(path)) throw new Error(`Missing prompt for "${key}" at ${path}`);
  const body = readFileSync(path, "utf8").trim();
  if (!body.includes("{{CONTEXT}}")) {
    throw new Error(`${key}/prompt.md has no {{CONTEXT}} placeholder — the shared business context would be missing.`);
  }
  return [key, body.replace("{{CONTEXT}}", context)];
});

const out = `// GENERATED FILE — do not edit.
// Source: packages/agents/<bot>/prompt.md + packages/agents/context.md
// Regenerate: pnpm prompts:build
/* eslint-disable */

export const PROMPTS: Record<string, string> = {
${entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}
};

export const PROMPT_KEYS = ${JSON.stringify(BOT_KEYS)} as const;
`;

writeFileSync(join(agentsDir, "prompts.generated.ts"), out, "utf8");

const total = entries.reduce((n, [, v]) => n + v.length, 0);
console.log(`Built ${entries.length} prompts (${(total / 1024).toFixed(1)} KB) -> packages/agents/prompts.generated.ts`);

// config/pricing.yaml is the human-editable source, but Convex has no
// filesystem, so convex/lib/pricingDefault.ts mirrors it. Drift between the two
// is silent and would ship the wrong prices, so check it here rather than hope.
const yamlPath = join(root, "config", "pricing.yaml");
const mirrorPath = join(root, "convex", "lib", "pricingDefault.ts");
if (existsSync(yamlPath) && existsSync(mirrorPath)) {
  const yaml = readFileSync(yamlPath, "utf8");
  const mirror = readFileSync(mirrorPath, "utf8");
  const embedded = mirror.slice(mirror.indexOf("`") + 1, mirror.lastIndexOf("`"));
  const norm = (s) => s.replace(/\\([`$\\])/g, "$1").trim();
  if (norm(embedded) !== norm(yaml)) {
    console.warn(
      "\n  WARNING: config/pricing.yaml and convex/lib/pricingDefault.ts have drifted.\n" +
      "  The Convex mirror is what gets seeded. Run: pnpm pricing:sync\n",
    );
    process.exitCode = 0; // a warning, not a build failure
  } else {
    console.log("pricing.yaml mirror is in sync.");
  }
}
