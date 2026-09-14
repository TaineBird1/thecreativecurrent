/**
 * Static check for Convex function references.
 *
 * `convex/_generated/` only exists after `npx convex dev` has connected to a
 * real deployment, so `tsc` cannot verify that `api.leads.byId` or
 * `internal.outbound.sendEmail` actually point at something. That is the single
 * most likely kind of mistake in this codebase — a renamed export, a function
 * in the wrong file — and it fails at runtime, not at build.
 *
 * So: parse every `api.x.y` / `internal.x.y` reference out of the source and
 * confirm the target file exists and exports that name, with the right
 * visibility (internal* functions are only reachable via `internal.`).
 *
 * Run: pnpm check:refs   (also part of pnpm verify)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexDir = join(root, "convex");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "_generated") continue;
      out.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(convexDir);

// module path ("leads", "agents/outreach") -> { name -> kind }
const exports = new Map();
const EXPORT_RE =
  /export\s+const\s+(\w+)\s*=\s*(query|mutation|action|internalQuery|internalMutation|internalAction)\s*\(/g;

for (const file of files) {
  const modPath = relative(convexDir, file).replace(/\.ts$/, "").replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");
  const found = new Map();
  let m;
  while ((m = EXPORT_RE.exec(src)) !== null) found.set(m[1], m[2]);
  exports.set(modPath, found);
}

const INTERNAL_KINDS = new Set(["internalQuery", "internalMutation", "internalAction"]);
const PUBLIC_KINDS = new Set(["query", "mutation", "action"]);

// Also scan the app, which calls the public API.
const appFiles = [];
for (const dir of ["app", "worker", "packages"]) {
  const full = join(root, dir);
  try {
    if (statSync(full).isDirectory()) {
      appFiles.push(
        ...walk(full).concat(
          readdirSync(full, { recursive: true })
            .filter((f) => typeof f === "string" && /\.(tsx|mjs)$/.test(f))
            .map((f) => join(full, f)),
        ),
      );
    }
  } catch {
    /* directory may not exist yet */
  }
}

const problems = [];
// The lookbehind keeps URLs out of it: "https://api.resend.com" is not a
// Convex reference, and neither is anything reached through a path segment.
const REF_RE = /(?<![\w./-])(api|internal)\.([\w.]+)\b/g;

for (const file of [...files, ...new Set(appFiles)]) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const where = relative(root, file);
  let m;
  while ((m = REF_RE.exec(src)) !== null) {
    const [full, root_, path] = m;
    const parts = path.split(".");
    if (parts.length < 2) continue;
    const fnName = parts[parts.length - 1];
    const modPath = parts.slice(0, -1).join("/");

    const mod = exports.get(modPath);
    if (!mod) {
      problems.push(`${where}: ${full} — no convex/${modPath}.ts`);
      continue;
    }
    const kind = mod.get(fnName);
    if (!kind) {
      const near = [...mod.keys()].slice(0, 6).join(", ");
      problems.push(`${where}: ${full} — convex/${modPath}.ts exports no "${fnName}" (has: ${near})`);
      continue;
    }
    if (root_ === "api" && INTERNAL_KINDS.has(kind)) {
      problems.push(`${where}: ${full} — "${fnName}" is ${kind}; reach it via internal.${path}`);
    }
    if (root_ === "internal" && PUBLIC_KINDS.has(kind)) {
      problems.push(`${where}: ${full} — "${fnName}" is a public ${kind}; reach it via api.${path}`);
    }
  }
}

const total = [...exports.values()].reduce((n, m) => n + m.size, 0);
if (problems.length === 0) {
  console.log(`Convex refs OK — ${total} functions across ${exports.size} modules, every reference resolves.`);
} else {
  console.error(`\n${problems.length} bad Convex reference(s):\n`);
  for (const p of [...new Set(problems)]) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}
