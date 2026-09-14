/**
 * Loads a TypeScript module into Node for testing, with no build step and no
 * extra dependency beyond the TypeScript compiler that is already installed.
 * Relative imports are rewritten to the compiled siblings.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(tmpdir(), "tcc-office-tests");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const cache = new Map();

export async function loadTs(relPath, deps = {}) {
  if (cache.has(relPath)) return cache.get(relPath);

  // Compile dependencies first so the rewritten specifiers resolve.
  for (const depPath of Object.values(deps)) await loadTs(depPath);

  let src = readFileSync(join(root, relPath), "utf8");
  for (const [spec, depPath] of Object.entries(deps)) {
    const name = basename(depPath).replace(/\.ts$/, ".js");
    src = src.replaceAll(`"${spec}"`, `"./${name}"`);
  }

  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  const outFile = join(outDir, basename(relPath).replace(/\.ts$/, ".js"));
  writeFileSync(outFile, js);
  const mod = await import(`${pathToFileURL(outFile).href}?v=${Date.now()}`);
  cache.set(relPath, mod);
  return mod;
}
