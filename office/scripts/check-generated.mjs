/**
 * Refuses to let the stub stand in for real Convex types.
 *
 * convex/_generated is committed, because the Cloudflare Pages build cannot
 * produce it: `npx convex codegen` needs a configured deployment and
 * credentials, neither of which a build machine has.
 *
 * But scripts/stub-generated.mjs writes a placeholder into that same directory
 * so `pnpm typecheck` can run without a deployment, and the two are now one
 * `git add -A` apart. Committing the stub would be silent and expensive: the
 * build would succeed against types that describe nothing, every `api.*` call
 * would be `any`, and the first thing anyone would know about it is a deployed
 * office throwing at runtime.
 *
 * So: the stub may exist locally, and may never be the committed version.
 *
 * Run: pnpm check:generated (part of pnpm verify)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "convex", "_generated");
const STUB_MARKER = "STUB — see scripts/stub-generated.mjs";
const REQUIRED = ["api.d.ts", "api.js", "server.d.ts", "server.js", "dataModel.d.ts"];

function tracked(relPath) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", relPath], {
      cwd: root,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

const problems = [];

for (const name of REQUIRED) {
  const rel = `convex/_generated/${name}`;
  const abs = join(dir, name);

  if (!tracked(rel)) {
    problems.push(
      `${rel} is not committed.\n` +
        `      The Cloudflare build cannot generate it — it has no Convex credentials.\n` +
        `      Run \`npx convex dev\` to produce the real file, then commit it.`,
    );
    continue;
  }

  // Committed, but is what is committed the real thing? Read the committed
  // blob rather than the working copy: the working copy may legitimately be a
  // stub right now, and it is the committed version that gets deployed.
  let committed = "";
  try {
    committed = execFileSync("git", ["show", `HEAD:office/${rel}`], {
      cwd: join(root, ".."),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Not in HEAD yet (staged for a first commit). Fall back to the file.
    committed = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  }

  if (committed.includes(STUB_MARKER)) {
    problems.push(
      `${rel} is the STUB, not the real generated file.\n` +
        `      A deployed build against this types every api.* call as \`any\`.\n` +
        `      Run \`npx convex dev\` to regenerate, then commit the result.`,
    );
  }
}

if (problems.length > 0) {
  console.error("\nGenerated Convex types are not deployable:\n");
  for (const p of problems) console.error(`  ✖ ${p}\n`);
  process.exit(1);
}

console.log("Generated types OK — real, committed, and safe to build from.");
