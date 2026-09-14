/**
 * Syntax check across every TypeScript file.
 *
 * `tsc --noEmit` can't run until `npx convex dev` has generated
 * convex/_generated, so until then this is the safety net: it parses every
 * .ts/.tsx file and reports syntax errors. It will not catch a type error — but
 * it catches every typo, unbalanced brace and malformed JSX, which is the class
 * of mistake that would otherwise only surface on first deploy.
 *
 * Run: pnpm check:syntax   (part of pnpm verify)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", "out", "_generated", ".git", ".convex"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(root);
let bad = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.ES2022,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  // parseDiagnostics is internal but stable, and it is the only way to get
  // syntax-only errors without a full Program (which needs _generated).
  const diags = sf.parseDiagnostics ?? [];
  for (const d of diags) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    console.error(
      `  ${relative(root, file)}:${line + 1}:${character + 1} — ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
    );
    bad++;
  }
}

if (bad > 0) {
  console.error(`\n${bad} syntax error(s) across ${files.length} files.\n`);
  process.exit(1);
}
console.log(`Syntax OK — ${files.length} TypeScript files parse cleanly.`);
