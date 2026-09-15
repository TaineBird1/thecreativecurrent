/**
 * One command to take an update: pull, rebuild the prompts, re-seed.
 *
 * Exists because the three steps are easy to do in the wrong order or forget
 * one of — a prompt change does nothing until it is seeded, since the live
 * prompt is a database row, and that has caught us out more than once.
 *
 * It does NOT restart the local worker. That is a separate process in its own
 * terminal and stopping someone's worker from under them would be rude; it
 * says so at the end instead.
 *
 * Run: pnpm refresh
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shell = process.platform === "win32";

function run(label, command, args) {
  process.stdout.write(`\n── ${label}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell });
  if (result.status !== 0) {
    console.error(`\n  ${label} failed. Nothing after this step has run.\n`);
    process.exit(result.status ?? 1);
  }
}

run("Pulling the latest code", "git", ["pull"]);
run("Rebuilding the prompts", "node", ["scripts/build-prompts.mjs"]);
run("Seeding (prompts live in the database, so this is what applies them)", "npx", [
  "convex",
  "run",
  "seed:run",
]);

console.log(`
── Done.

  Convex redeploys itself — check the convex dev tab says "functions ready".
  The browser reloads itself too.

  The local worker does NOT: it is a plain script in its own terminal. If this
  update touched worker/index.mjs, go to that tab, press Ctrl+C, then run:

      pnpm worker
`);
