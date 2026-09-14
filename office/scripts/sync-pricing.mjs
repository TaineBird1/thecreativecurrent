/**
 * Regenerates convex/lib/pricingDefault.ts from config/pricing.yaml.
 * Run after editing the YAML: pnpm pricing:sync
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yaml = readFileSync(join(root, "config", "pricing.yaml"), "utf8");
const escaped = yaml.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

writeFileSync(
  join(root, "convex", "lib", "pricingDefault.ts"),
  `/**
 * Default pricing rules, mirrored from config/pricing.yaml so the Convex
 * bundler can import them (it has no filesystem). config/pricing.yaml is the
 * human-editable source; the Settings copy in the DB is what actually runs.
 *
 * GENERATED — regenerate with: pnpm pricing:sync
 */
export const PRICING_YAML = \`
${escaped}\`;
`,
  "utf8",
);
console.log("convex/lib/pricingDefault.ts regenerated from config/pricing.yaml");
