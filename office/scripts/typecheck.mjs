/**
 * Typecheck, honest about what it can and cannot see.
 *
 * With the REAL convex/_generated (after `npx convex dev`), this is a plain
 * full `tsc --noEmit` and everything it says is true.
 *
 * With the stub from scripts/stub-generated.mjs, `api` and `internal` are
 * untyped, so every value that comes back from ctx.runQuery / useQuery is
 * `any`. That produces a large, entirely fake crop of "implicitly has an any
 * type" errors downstream. Those are suppressed and counted, rather than
 * either shown (drowning the real ones) or silently dropped (pretending the
 * check is complete when it isn't).
 *
 * The authority is always `npx convex dev`. This is the fast local pass.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stubbed = existsSync(join(root, "convex", "_generated", ".stub"));
const generatedMissing = !existsSync(join(root, "convex", "_generated"));

if (generatedMissing) {
  console.error(
    "\n  convex/_generated doesn't exist, so nothing can be typechecked.\n" +
      "  Either run `npx convex dev` (the real thing), or `node scripts/stub-generated.mjs`\n" +
      "  for a local stand-in that checks everything except function return types.\n",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["tsc", "--noEmit"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});

const lines = (result.stdout ?? "").split("\n").filter((l) => /error TS\d+/.test(l));

// Codes that are purely downstream of an untyped `api`. Each one means "the
// type of a value returned by a Convex function is unknown", which is exactly
// what the stub cannot know.
const STUB_NOISE = /error (TS7006|TS7053|TS7031|TS18046|TS2571)\b/;
const STUB_NOISE_PROPERTY = /error TS2339: Property '.*' does not exist on type '(\{\}|\{ createdAt: number; \})'/;

const real = stubbed
  ? lines.filter((l) => !STUB_NOISE.test(l) && !STUB_NOISE_PROPERTY.test(l))
  : lines;
const suppressed = lines.length - real.length;

if (stubbed) {
  console.log(
    "convex/_generated is a STUB — function return types are unknown here.\n" +
      "`npx convex dev` is the real check. This catches everything that doesn't\n" +
      "depend on what a Convex function returns.\n",
  );
}

if (real.length > 0) {
  for (const line of real) console.error(`  ${line}`);
  console.error(`\n${real.length} type error(s).`);
  if (suppressed > 0) console.error(`${suppressed} stub artefact(s) suppressed.`);
  process.exit(1);
}

console.log(
  `Types OK${stubbed ? ` — ${suppressed} stub artefact(s) suppressed; run \`npx convex dev\` for the full check` : ""}.`,
);
