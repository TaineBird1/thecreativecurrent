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

/** Same, but a failure is reported and stepped over rather than fatal. */
function runSoft(label, command, args, ifItFails) {
  process.stdout.write(`\n── ${label}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell });
  if (result.status !== 0) console.error(`\n  ${ifItFails}\n`);
  return result.status === 0;
}

run("Pulling the latest code", "git", ["pull"]);
run("Rebuilding the prompts", "node", ["scripts/build-prompts.mjs"]);

// Push the code we just pulled BEFORE asking the deployment to run any of it.
//
// `convex run` executes whatever is currently deployed, and the `convex dev`
// watcher deploys asynchronously after git writes the files — so the seed here
// reliably ran one version behind. That failure is near-invisible: the seed
// succeeds, prints the previous version's output, and the change you just
// pulled appears not to have done anything.
//
// Soft-failed on purpose. If the watcher is mid-push this can lose the race and
// report a conflict, and that is not a reason to abandon a refresh — the seed
// below still works, it just may be a beat behind again.
runSoft(
  "Deploying the code that was just pulled",
  "npx",
  ["convex", "dev", "--once"],
  "Could not push just now — the convex dev tab may have been mid-deploy.\n" +
    "  Seeding anyway. If the output below looks like the old version, wait for\n" +
    '  that tab to say "functions ready" and run: pnpm seed',
);

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
