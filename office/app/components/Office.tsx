"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { DeskDrawer } from "./DeskDrawer";

type Bot = NonNullable<ReturnType<typeof useQuery<typeof api.bots.list>>>[number];

/**
 * The office floor.
 *
 * Rendered as an SVG floor plane with HTML desks positioned on top by an
 * isometric projection computed in JS. Chosen over a CSS 3D transform because
 * the desks need to stay upright and legible: with `rotateX/rotateZ` on a
 * parent, every child has to be counter-rotated, and text ends up soft. This
 * way the floor is genuinely 2.5D and the people on it are crisp.
 *
 * Below `lg` the whole thing collapses to a vertical list of desk cards, which
 * is what actually works on a phone.
 */

const ZONES = [
  { id: "leadership", label: "Leadership", sub: "corner office", x: 0, y: 0, w: 46, h: 44, tint: "#2a211a" },
  { id: "revenue", label: "Revenue", sub: "pays for everything", x: 50, y: 0, w: 50, h: 52, tint: "#231f1c" },
  { id: "marketing", label: "Marketing", sub: "studio side", x: 0, y: 48, w: 58, h: 52, tint: "#241b20" },
  { id: "client_success", label: "Client Success", sub: "by reception", x: 62, y: 56, w: 38, h: 44, tint: "#1e2220" },
] as const;

/** Isometric projection: floor space (0-100, 0-100) to screen percentages. */
function project(x: number, y: number): { left: number; top: number } {
  const nx = x / 100;
  const ny = y / 100;
  return {
    left: 50 + (nx - ny) * 42,
    top: 12 + (nx + ny) * 33,
  };
}

const STATUS = {
  idle: { ring: "#6d6159", label: "Idle", tone: "text-faint", anim: "anim-breathe" },
  working: { ring: "#ffb547", label: "Working", tone: "text-lamp", anim: "anim-typing" },
  waiting_on_boss: { ring: "#f0603c", label: "Waiting on you", tone: "text-rust", anim: "anim-handup" },
  blocked: { ring: "#f0603c", label: "Blocked", tone: "text-rust", anim: "" },
  off_shift: { ring: "#3a302a", label: "Off shift", tone: "text-faint", anim: "" },
} as const;

export function Office() {
  const bots = useQuery(api.bots.list);
  const [openBot, setOpenBot] = useState<string | null>(null);

  if (!bots) {
    return (
      <div className="grid h-[520px] place-items-center text-sm text-faint">
        <span className="thinking-dots">Turning the lights on</span>
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="grid h-[420px] place-items-center px-6 text-center">
        <div>
          <p className="mb-2 text-sm text-cream">The office is empty.</p>
          <p className="text-xs text-faint">
            Run <code className="text-lamp">pnpm seed</code> to hire the nine bots.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Desktop: the isometric floor ────────────────────────────────── */}
      <div className="relative hidden lg:block">
        <div className="relative mx-auto aspect-[16/10] w-full max-w-[1100px]">
          <FloorPlane />
          {bots.map((bot) => (
            <Desk key={bot._id} bot={bot} onOpen={() => setOpenBot(bot.key)} />
          ))}
        </div>
      </div>

      {/* ── Mobile: the same information, stacked ───────────────────────── */}
      <div className="space-y-2 lg:hidden">
        {ZONES.map((zone) => {
          const inZone = bots.filter((b) => b.desk.zone === zone.id);
          if (inZone.length === 0) return null;
          return (
            <div key={zone.id}>
              <div className="px-1 pb-1.5 pt-3 text-[11px] uppercase tracking-wider text-faint">
                {zone.label}
              </div>
              <div className="space-y-2">
                {inZone.map((bot) => (
                  <DeskCard key={bot._id} bot={bot} onOpen={() => setOpenBot(bot.key)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {openBot && <DeskDrawer botKey={openBot} onClose={() => setOpenBot(null)} />}
    </>
  );
}

function FloorPlane() {
  return (
    <svg viewBox="0 0 100 62" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#241d18" />
          <stop offset="100%" stopColor="#14100d" />
        </linearGradient>
        <radialGradient id="lampPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb547" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The floor itself — one big diamond. */}
      <polygon points="50,4 96,37 50,58 4,37" fill="url(#floorGrad)" />
      <polygon
        points="50,4 96,37 50,58 4,37"
        fill="none"
        stroke="#453931"
        strokeWidth="0.25"
        opacity="0.55"
      />

      {ZONES.map((zone) => {
        const a = project(zone.x, zone.y);
        const b = project(zone.x + zone.w, zone.y);
        const c = project(zone.x + zone.w, zone.y + zone.h);
        const d = project(zone.x, zone.y + zone.h);
        const pts = [a, b, c, d]
          .map((p) => `${p.left},${(p.top / 100) * 62}`)
          .join(" ");
        const centre = project(zone.x + zone.w / 2, zone.y + zone.h / 2);
        return (
          <g key={zone.id}>
            <polygon points={pts} fill={zone.tint} opacity="0.85" />
            <polygon points={pts} fill="none" stroke="#453931" strokeWidth="0.15" opacity="0.7" />
            <ellipse
              cx={centre.left}
              cy={(centre.top / 100) * 62}
              rx="16"
              ry="9"
              fill="url(#lampPool)"
              className="anim-lamp"
            />
            <text
              x={centre.left}
              y={(centre.top / 100) * 62 + 11}
              textAnchor="middle"
              fontSize="1.5"
              fill="#6d6159"
              letterSpacing="0.3"
              style={{ textTransform: "uppercase" }}
            >
              {zone.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Desk({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const zone = ZONES.find((z) => z.id === bot.desk.zone) ?? ZONES[0];
  const pos = project(zone.x + (zone.w * bot.desk.x) / 100, zone.y + (zone.h * bot.desk.y) / 100);
  const status = STATUS[bot.status];
  const needsYou = bot.status === "waiting_on_boss" || bot.openEscalations > 0;

  return (
    <button
      onClick={onOpen}
      style={{ left: `${pos.left}%`, top: `${pos.top}%`, zIndex: Math.round(pos.top) }}
      className="group absolute w-[132px] -translate-x-1/2 -translate-y-full text-left focus:outline-none"
    >
      {/* Speech bubble — what they're doing right now, in 8 words or less. */}
      {bot.status !== "off_shift" && (
        <div className="anim-in mb-1.5 rounded-xl border border-edge bg-panel-2/95 px-2.5 py-1.5 text-[10.5px] leading-snug text-cream shadow-lg">
          {bot.currentTask}
          <span className="absolute -bottom-1 left-6 h-2 w-2 rotate-45 border-b border-r border-edge bg-panel-2" />
        </div>
      )}

      <div
        className={`relative rounded-xl border bg-panel/95 p-2 shadow-xl transition group-hover:border-lamp/60 group-focus-visible:border-lamp ${
          bot.status === "off_shift" ? "border-edge opacity-45" : "border-edge"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            style={{ ["--ring-color" as string]: status.ring, borderColor: status.ring }}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 bg-ink text-base ${status.anim} ${
              needsYou ? "anim-ring" : ""
            }`}
          >
            {bot.avatar}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-tight">{bot.name}</span>
            <span className={`block truncate text-[10px] leading-tight ${status.tone}`}>
              {status.label}
            </span>
          </span>
        </div>

        {needsYou && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rust text-[10px] font-bold text-white shadow">
            {bot.openEscalations || "!"}
          </span>
        )}

        {/* Budget meter — how much of today's free quota this desk has spent. */}
        <span className="mt-1.5 block h-0.5 w-full overflow-hidden rounded-full bg-edge">
          <span
            className="block h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (bot.budgetUsed / Math.max(1, bot.budgetLimit)) * 100)}%`,
              background: bot.budgetUsed >= bot.budgetLimit ? "#f0603c" : "#ffb547",
            }}
          />
        </span>
      </div>
    </button>
  );
}

function DeskCard({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const status = STATUS[bot.status];
  const needsYou = bot.status === "waiting_on_boss" || bot.openEscalations > 0;
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl border bg-panel p-3 text-left ${
        needsYou ? "border-rust/50" : "border-edge"
      } ${bot.status === "off_shift" ? "opacity-50" : ""}`}
    >
      <span
        style={{ borderColor: status.ring }}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border-2 bg-ink text-lg ${status.anim}`}
      >
        {bot.avatar}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{bot.name}</span>
          <span className={`text-[11px] ${status.tone}`}>{status.label}</span>
        </span>
        <span className="block truncate text-xs text-faint">{bot.currentTask}</span>
      </span>
      {needsYou && (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-rust text-[10px] font-bold text-white">
          {bot.openEscalations || "!"}
        </span>
      )}
    </button>
  );
}
