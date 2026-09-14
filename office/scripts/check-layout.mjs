/**
 * Geometry check for the office floor.
 *
 * The floor is drawn with an isometric projection, and two things go wrong in
 * it that are invisible in code review and obvious on screen:
 *
 *   1. Two desks landing on top of each other. In this projection, points with
 *      a similar (x + y) share a height and points with a similar (x - y)
 *      share a horizontal position, so desks must be separated on BOTH.
 *   2. A nameplate from the row behind landing on the head of the person in
 *      front. Each workstation occupies a person above the desk and a plate
 *      below it, and that stack has to fit inside the gap between rows.
 *
 * Both were real, both shipped once. This asserts them instead.
 *
 * Run: pnpm check:layout (part of pnpm verify)
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const office = readFileSync(join(root, "app/components/Office.tsx"), "utf8");
const registry = readFileSync(join(root, "packages/agents/registry.ts"), "utf8");

const num = (name, src = office) => {
  const m = new RegExp(`const ${name} = ([\\d.]+)`).exec(src);
  if (!m) throw new Error(`Couldn't read ${name} out of Office.tsx`);
  return Number(m[1]);
};
const SPREAD_X = num("SPREAD_X");
const SPREAD_Y = num("SPREAD_Y");
const HORIZON = num("HORIZON");
const DESK_D = num("DESK_D");
const VB_H = Number(/const VB = \{ w: 100, h: ([\d.]+) \}/.exec(office)[1]);

const iso = (x, y) => ({
  u: 50 + (x / 100 - y / 100) * SPREAD_X,
  v: HORIZON + (x / 100 + y / 100) * SPREAD_Y,
});

// Desk positions, read from the registry so this can never drift from reality.
const desks = [];
const re = /key: "(\w+)",[\s\S]*?desk: \{ zone: "(\w+)", x: (-?[\d.]+), y: (-?[\d.]+) \}/g;
let m;
while ((m = re.exec(registry)) !== null) {
  desks.push({ key: m[1], zone: m[2], x: Number(m[3]), y: Number(m[4]) });
}
if (desks.length === 0) throw new Error("No desks found in registry.ts");

// Measured from the drawing: how far a workstation reaches above and below its
// desk centre, in viewBox units. Head top, and the bottom of the nameplate.
const SEAT_BACK = DESK_D + 2;
const PERSON_ABOVE = (SEAT_BACK - 1) * (SPREAD_Y / 100) + 3.8; // seat offset + head
const PLATE_BELOW = DESK_D * (SPREAD_Y / 100) + 1.5 + 1.9; // desk front + lip + plate

// A stage 1400px wide; the nameplate is about 120px across at that size.
const STAGE_W = 1400;
const PLATE_W_U = (120 / STAGE_W) * 100;

const problems = [];

for (let i = 0; i < desks.length; i++) {
  for (let j = i + 1; j < desks.length; j++) {
    const a = iso(desks[i].x, desks[i].y);
    const b = iso(desks[j].x, desks[j].y);
    const [back, front] = a.v <= b.v ? [a, b] : [b, a];
    const [backK, frontK] = a.v <= b.v ? [desks[i].key, desks[j].key] : [desks[j].key, desks[i].key];
    const du = Math.abs(a.u - b.u);
    const gap = front.v - back.v;

    // Only matters when they are roughly in the same column.
    if (du >= PLATE_W_U) continue;

    if (gap < 1.5) {
      problems.push(`${backK} and ${frontK} sit on top of each other (${du.toFixed(1)}u apart, ${gap.toFixed(1)}v apart)`);
      continue;
    }
    const needed = PLATE_BELOW + PERSON_ABOVE;
    if (gap < needed) {
      problems.push(
        `${backK}'s nameplate lands on ${frontK}'s head — rows are ${gap.toFixed(1)}v apart, a workstation needs ${needed.toFixed(1)}v`,
      );
    }
  }
}

// Everything has to be inside the canvas.
for (const d of desks) {
  const p = iso(d.x, d.y);
  if (p.v + PLATE_BELOW > VB_H) problems.push(`${d.key}'s nameplate falls off the bottom (v=${(p.v + PLATE_BELOW).toFixed(1)} of ${VB_H})`);
  if (p.v - PERSON_ABOVE < 0) problems.push(`${d.key}'s head is above the canvas`);
  if (p.u - PLATE_W_U / 2 < 0 || p.u + PLATE_W_U / 2 > 100) problems.push(`${d.key}'s nameplate runs off the side (u=${p.u.toFixed(1)})`);
}

if (problems.length > 0) {
  console.error("\nOffice layout problems:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

const rows = [...new Set(desks.map((d) => iso(d.x, d.y).v.toFixed(1)))].sort((a, b) => a - b);
console.log(
  `Office layout OK — ${desks.length} desks across ${rows.length} rows, ` +
    `each workstation needs ${(PLATE_BELOW + PERSON_ABOVE).toFixed(1)}v and has it.`,
);
