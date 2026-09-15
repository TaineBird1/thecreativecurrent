/**
 * Refuses to let a public Convex function be defined without a session check.
 *
 * Anything exported with the raw `query`, `mutation` or `action` builders is
 * callable by anyone who knows the deployment URL — and that URL ships inside
 * the web bundle, so "anyone" means anyone who can load the site. The whole
 * point of convex/lib/authed.ts is that the check cannot be forgotten; this is
 * what makes that true, rather than a thing we intend.
 *
 * One function added in a hurry with the wrong builder would reopen the hole
 * silently. Nothing about the code would look wrong, and no test would fail.
 *
 * Run: pnpm check:authed (part of pnpm verify)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexDir = join(root, "convex");

/**
 * The only functions allowed to be reachable without a session, and why.
 * Adding to this list is a decision about who can reach your data.
 */
const OPEN_BY_DESIGN = {
  "auth.ts": {
    login: "takes the passcode and issues a token — must work before you have one",
    check: "says whether a token is still valid — the gate calls it on load",
  },
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_generated") continue;
      out.push(...walk(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// `export const foo = query({` — the definition sites. internalQuery and
// friends never match (different identifier), and ctx.db.query( has no
// "= " before it.
const RAW = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(query|mutation|action)\(\{/g;

const problems = [];
let checked = 0;

for (const file of walk(convexDir)) {
  const rel = relative(convexDir, file);
  const source = readFileSync(file, "utf8");
  const allowed = OPEN_BY_DESIGN[rel] ?? {};

  for (const m of source.matchAll(RAW)) {
    const [, name, kind] = m;
    if (allowed[name]) {
      checked++;
      continue;
    }
    const line = source.slice(0, m.index).split("\n").length;
    problems.push(
      `convex/${rel}:${line}  ${name} is a public ${kind} with no session check.\n` +
        `      Anyone who can load the site can call it. Use authed${kind[0].toUpperCase()}${kind.slice(1)}\n` +
        `      from convex/lib/authed.ts, or make it internal${kind[0].toUpperCase()}${kind.slice(1)} if\n` +
        `      only other Convex functions call it.`,
    );
  }

  checked += (source.match(/=\s*authed(?:Query|Mutation|Action)\(\{/g) ?? []).length;
}

if (problems.length > 0) {
  console.error("\nPublic Convex functions are reachable without signing in:\n");
  for (const p of problems) console.error(`  ✖ ${p}\n`);
  process.exit(1);
}

const open = Object.values(OPEN_BY_DESIGN).reduce((n, f) => n + Object.keys(f).length, 0);
console.log(
  `Auth OK — ${checked - open} public function(s) require a session, ${open} open by design.`,
);
