"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { DeskDrawer } from "./DeskDrawer";

type Bot = NonNullable<ReturnType<typeof useQuery<typeof api.bots.list>>>[number];

/**
 * The office floor.
 *
 * The room — floor, walls, rugs, desks, chairs, monitors — is drawn in SVG from
 * one isometric projection. The people are HTML positioned on top of it, so
 * their names stay crisp and they stay clickable. A CSS 3D transform on a
 * parent would have been less code and would have meant counter-rotating every
 * label and reading soft text at an angle.
 *
 * Two things learned from the first version, which was unreadable:
 *
 *  - Desks need separating on BOTH diagonals. In this projection, two points
 *    with a similar (x + y) land at the same height and two with a similar
 *    (x - y) land at the same horizontal position. Spreading on one axis only
 *    stacks people on top of each other.
 *  - Speech bubbles only appear when a bot has something to say. Nine bubbles
 *    all reading "Waiting for the day to start" was most of the clutter, and
 *    told you nothing.
 *
 * Below xl the whole thing becomes a vertical list of desk cards, which is what
 * actually works on a narrow screen.
 */

// ── The projection ──────────────────────────────────────────────────────────
const VB = { w: 100, h: 68 };
const SPREAD_X = 46;
const SPREAD_Y = 24;
const HORIZON = 11;

function iso(x: number, y: number): { u: number; v: number } {
  const nx = x / 100;
  const ny = y / 100;
  return { u: 50 + (nx - ny) * SPREAD_X, v: HORIZON + (nx + ny) * SPREAD_Y };
}

const pt = (p: { u: number; v: number }) => `${p.u.toFixed(2)},${p.v.toFixed(2)}`;

/** The four corners of a floor rectangle, as an isometric diamond. */
function slab(x0: number, y0: number, x1: number, y1: number): string {
  return [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(pt).join(" ");
}

// ── The rooms ───────────────────────────────────────────────────────────────
// Each rug is drawn around wherever its people actually sit, so it can never
// drift away from them.
const ZONES = [
  { id: "leadership", label: "Leadership", box: [0, 0, 40, 40], tint: "#2e2319", edge: "#4a3a28" },
  { id: "revenue", label: "Revenue", box: [52, 0, 100, 58], tint: "#28211b", edge: "#453a2e" },
  { id: "marketing", label: "Marketing", box: [0, 52, 58, 100], tint: "#291c24", edge: "#472f3f" },
  { id: "client_success", label: "Client success", box: [64, 64, 100, 100], tint: "#1d2422", edge: "#2d443d" },
] as const;

const STATUS = {
  idle: { ring: "#6d6159", label: "Idle", tone: "text-faint", anim: "anim-breathe", screen: "#231c17" },
  working: { ring: "#ffb547", label: "Working", tone: "text-lamp", anim: "anim-typing", screen: "#0d3d4a" },
  waiting_on_boss: { ring: "#f0603c", label: "Waiting on you", tone: "text-rust", anim: "anim-handup", screen: "#3d1a12" },
  blocked: { ring: "#f0603c", label: "Blocked", tone: "text-rust", anim: "", screen: "#2a1512" },
  off_shift: { ring: "#3a302a", label: "Off shift", tone: "text-faint", anim: "", screen: "#17120f" },
} as const;

/** Only these three have anything worth saying out loud. */
const SPEAKS = new Set(["working", "waiting_on_boss", "blocked"]);

const DESK_W = 8;
const DESK_D = 5.5;
const DESK_LIP = 1.5;

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

  // Painter's algorithm: everything further back is drawn first, so a desk at
  // the front of the room overlaps the one behind it and not the other way round.
  const inDepthOrder = [...bots].sort(
    (a, b) => iso(a.desk.x, a.desk.y).v - iso(b.desk.x, b.desk.y).v,
  );

  return (
    <>
      <div className="relative hidden xl:block">
        <div className="relative mx-auto aspect-[100/68] w-full">
          <Room bots={inDepthOrder} />
          {inDepthOrder.map((bot) => (
            <Person key={bot._id} bot={bot} onOpen={() => setOpenBot(bot.key)} />
          ))}
        </div>
      </div>

      <div className="space-y-2 xl:hidden">
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

// ── The room ────────────────────────────────────────────────────────────────
function Room({ bots }: { bots: Bot[] }) {
  const WALL_H = 13;
  const back = iso(0, 0);
  const rightEnd = iso(100, 0);
  const leftEnd = iso(0, 100);

  return (
    <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#15110e" />
          <stop offset="100%" stopColor="#241c16" />
        </linearGradient>
        <linearGradient id="floorGrad" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#1e1813" />
          <stop offset="100%" stopColor="#120e0b" />
        </linearGradient>
        <radialGradient id="lampPool">
          <stop offset="0%" stopColor="#ffb547" stopOpacity="0.16" />
          <stop offset="70%" stopColor="#ffb547" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="windowGlow">
          <stop offset="0%" stopColor="#2b3b5c" />
          <stop offset="100%" stopColor="#10151f" />
        </radialGradient>
      </defs>

      {/* Two back walls, so the floor reads as a room and not a rug in space. */}
      <polygon
        points={`${pt(back)} ${pt(rightEnd)} ${rightEnd.u},${rightEnd.v - WALL_H} ${back.u},${back.v - WALL_H}`}
        fill="url(#wallGrad)"
      />
      <polygon
        points={`${pt(back)} ${pt(leftEnd)} ${leftEnd.u},${leftEnd.v - WALL_H} ${back.u},${back.v - WALL_H}`}
        fill="url(#wallGrad)"
      />
      {/* Skirting, where wall meets floor. */}
      <polyline
        points={`${pt(leftEnd)} ${pt(back)} ${pt(rightEnd)}`}
        fill="none"
        stroke="#4a3b2e"
        strokeWidth="0.3"
        opacity="0.8"
      />

      {/* Windows on the right wall — a studio at night, not a bunker. */}
      {[0.28, 0.58].map((t, i) => {
        const a = { u: back.u + (rightEnd.u - back.u) * t, v: back.v + (rightEnd.v - back.v) * t };
        const b = {
          u: back.u + (rightEnd.u - back.u) * (t + 0.16),
          v: back.v + (rightEnd.v - back.v) * (t + 0.16),
        };
        return (
          <g key={i}>
            <polygon
              points={`${a.u},${a.v - 3} ${b.u},${b.v - 3} ${b.u},${b.v - 10.5} ${a.u},${a.v - 10.5}`}
              fill="url(#windowGlow)"
              stroke="#3a2f26"
              strokeWidth="0.25"
            />
            <line
              x1={(a.u + b.u) / 2}
              y1={(a.v + b.v) / 2 - 3}
              x2={(a.u + b.u) / 2}
              y2={(a.v + b.v) / 2 - 10.5}
              stroke="#3a2f26"
              strokeWidth="0.2"
            />
          </g>
        );
      })}

      {/* The floor. */}
      <polygon points={slab(0, 0, 100, 100)} fill="url(#floorGrad)" />

      {/* Floorboards. Nothing says "floor" like floor lines. */}
      {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map((n) => (
        <g key={n} stroke="#3a2e25" strokeWidth="0.12" opacity="0.4">
          <line x1={iso(n, 0).u} y1={iso(n, 0).v} x2={iso(n, 100).u} y2={iso(n, 100).v} />
          <line x1={iso(0, n).u} y1={iso(0, n).v} x2={iso(100, n).u} y2={iso(100, n).v} />
        </g>
      ))}

      {/* Zone rugs, drawn around wherever their people actually sit. */}
      {ZONES.map((zone) => {
        const [x0, y0, x1, y1] = zone.box;
        const centre = iso((x0 + x1) / 2, (y0 + y1) / 2);
        return (
          <g key={zone.id}>
            <polygon points={slab(x0, y0, x1, y1)} fill={zone.tint} opacity="0.9" />
            <polygon
              points={slab(x0, y0, x1, y1)}
              fill="none"
              stroke={zone.edge}
              strokeWidth="0.22"
              opacity="0.7"
            />
            <text
              x={centre.u}
              y={centre.v}
              textAnchor="middle"
              fontSize="1.9"
              fill="#7a6a5d"
              opacity="0.5"
              letterSpacing="0.45"
              style={{ textTransform: "uppercase" }}
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {/* Furniture, back to front. */}
      {bots.map((bot) => (
        <Desk key={bot._id} bot={bot} />
      ))}
    </svg>
  );
}

function Desk({ bot }: { bot: Bot }) {
  const { x, y } = bot.desk;
  const status = STATUS[bot.status];
  const off = bot.status === "off_shift";
  const working = bot.status === "working";

  const top = iso(x - DESK_W, y - DESK_D);
  const right = iso(x + DESK_W, y - DESK_D);
  const bottom = iso(x + DESK_W, y + DESK_D);
  const left = iso(x - DESK_W, y + DESK_D);
  const backEdge = iso(x, y - DESK_D);
  const frontEdge = iso(x, y + DESK_D);

  return (
    <g opacity={off ? 0.4 : 1}>
      {/* Pool of lamplight on the desk. */}
      <ellipse
        cx={frontEdge.u}
        cy={frontEdge.v - 1}
        rx="13"
        ry="7"
        fill="url(#lampPool)"
        className={working ? "anim-lamp" : ""}
      />

      {/* Chair, in front of the desk. */}
      <ellipse cx={frontEdge.u} cy={frontEdge.v + 3.4} rx="2.6" ry="1.35" fill="#241d18" />
      <ellipse cx={frontEdge.u} cy={frontEdge.v + 3.0} rx="2.6" ry="1.35" fill="#33291f" />

      {/* Desk: the two front faces give it thickness. */}
      <polygon
        points={`${pt(left)} ${pt(bottom)} ${bottom.u},${bottom.v + DESK_LIP} ${left.u},${left.v + DESK_LIP}`}
        fill="#251d16"
      />
      <polygon
        points={`${pt(bottom)} ${pt(right)} ${right.u},${right.v + DESK_LIP} ${bottom.u},${bottom.v + DESK_LIP}`}
        fill="#1d1711"
      />
      <polygon
        points={`${pt(top)} ${pt(right)} ${pt(bottom)} ${pt(left)}`}
        fill="#3b2f24"
        stroke="#503f30"
        strokeWidth="0.18"
      />

      {/* Monitor, standing at the back edge. Its screen is the status light. */}
      <rect
        x={backEdge.u - 3.1}
        y={backEdge.v - 5.6}
        width="6.2"
        height="4.2"
        rx="0.45"
        fill="#100c09"
        stroke="#4a3b2e"
        strokeWidth="0.18"
      />
      <rect
        x={backEdge.u - 2.6}
        y={backEdge.v - 5.15}
        width="5.2"
        height="3.3"
        rx="0.25"
        fill={status.screen}
      />
      {working && (
        <rect
          x={backEdge.u - 2.1}
          y={backEdge.v - 4.5}
          width="0.5"
          height="1.1"
          fill="#7fe4ff"
          className="anim-typing"
        />
      )}
      <rect x={backEdge.u - 0.5} y={backEdge.v - 1.4} width="1" height="1.1" fill="#2b2119" />
      <rect x={backEdge.u - 1.6} y={backEdge.v - 0.5} width="3.2" height="0.5" rx="0.2" fill="#2b2119" />
    </g>
  );
}

// ── The people ──────────────────────────────────────────────────────────────
function Person({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const status = STATUS[bot.status];
  const needsYou = bot.status === "waiting_on_boss" || bot.openEscalations > 0;
  const speaks = SPEAKS.has(bot.status);

  // Stand them at the back edge of their own desk, so they read as sitting at it.
  const at = iso(bot.desk.x, bot.desk.y - DESK_D);
  const left = at.u;
  const top = (at.v / VB.h) * 100;

  return (
    <button
      onClick={onOpen}
      style={{ left: `${left}%`, top: `${top}%`, zIndex: Math.round(at.v * 10) }}
      className="group absolute w-[112px] -translate-x-1/2 -translate-y-full text-left focus:outline-none"
      aria-label={`${bot.name} — ${status.label}`}
    >
      {speaks && (
        <div className="anim-in relative mb-1.5 rounded-xl border border-edge bg-panel-2/95 px-2.5 py-1.5 text-[10.5px] leading-snug text-cream shadow-xl">
          {bot.currentTask}
          <span className="absolute -bottom-1 left-6 h-2 w-2 rotate-45 border-b border-r border-edge bg-panel-2" />
        </div>
      )}

      <div
        className={`relative rounded-xl border bg-panel/90 px-2 py-1.5 backdrop-blur-[2px] transition group-hover:-translate-y-0.5 group-hover:border-lamp/60 group-focus-visible:border-lamp ${
          bot.status === "off_shift" ? "border-edge opacity-50" : "border-edge shadow-lg"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            style={{ ["--ring-color" as string]: status.ring, borderColor: status.ring }}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 bg-ink text-sm ${status.anim} ${
              needsYou ? "anim-ring" : ""
            }`}
          >
            {bot.avatar}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11.5px] font-semibold leading-tight">
              {bot.name}
            </span>
            <span className={`block truncate text-[9.5px] leading-tight ${status.tone}`}>
              {status.label}
            </span>
          </span>
        </div>

        {needsYou && (
          <span className="absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-rust text-[9.5px] font-bold text-white shadow">
            {bot.openEscalations || "!"}
          </span>
        )}

        <span className="mt-1 block h-0.5 w-full overflow-hidden rounded-full bg-edge">
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
