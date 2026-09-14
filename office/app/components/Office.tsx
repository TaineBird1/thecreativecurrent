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
const VB = { w: 100, h: 72 };
const SPREAD_X = 46;
const SPREAD_Y = 26;
const HORIZON = 10;

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
  { id: "leadership", label: "Leadership", box: [0, 0, 36, 36], tint: "#2e2319", edge: "#4a3a28" },
  { id: "revenue", label: "Revenue", box: [52, 0, 100, 55], tint: "#28211b", edge: "#453a2e" },
  { id: "marketing", label: "Marketing", box: [0, 52, 55, 100], tint: "#291c24", edge: "#472f3f" },
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

/**
 * How each person looks. Shirt colour follows their department so a glance at
 * the room tells you which pod is busy; skin and hair vary per person because
 * nine identical figures is not a team, it is a pattern.
 */
const LOOK: Record<string, { skin: string; hair: string; shirt: string; sleeve: string }> = {
  orchestrator: { skin: "#8d5a3b", hair: "#1e1611", shirt: "#c98c3e", sleeve: "#a2702e" },
  strategy: { skin: "#c69166", hair: "#2c211a", shirt: "#b8823a", sleeve: "#946527" },
  leadgen: { skin: "#7a4a2e", hair: "#151110", shirt: "#2f7f8c", sleeve: "#226370" },
  outreach: { skin: "#a86c45", hair: "#251b15", shirt: "#37929e", sleeve: "#27707c" },
  proposal: { skin: "#d2a179", hair: "#3b2b1e", shirt: "#2a6f7d", sleeve: "#1e5763" },
  content: { skin: "#8d5a3b", hair: "#1d1511", shirt: "#9c4f96", sleeve: "#7d3d79" },
  seo: { skin: "#b98559", hair: "#2b2018", shirt: "#8a4a8e", sleeve: "#6d3a70" },
  design: { skin: "#6f4327", hair: "#130f0d", shirt: "#a85a9e", sleeve: "#874880" },
  clientsuccess: { skin: "#a06a44", hair: "#221913", shirt: "#3f8a63", sleeve: "#2f6d4d" },
};

const DEFAULT_LOOK = { skin: "#a06a44", hair: "#221913", shirt: "#6f6259", sleeve: "#544a43" };

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
            <NamePlate key={bot._id} bot={bot} onOpen={() => setOpenBot(bot.key)} />
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
          <stop offset="0%" stopColor="#1b1612" />
          <stop offset="100%" stopColor="#2e251d" />
        </linearGradient>
        <linearGradient id="floorGrad" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#2b231b" />
          <stop offset="100%" stopColor="#191310" />
        </linearGradient>
        <radialGradient id="lampPool">
          <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.30" />
          <stop offset="55%" stopColor="#ffb547" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampPoolHot">
          <stop offset="0%" stopColor="#ffd089" stopOpacity="0.52" />
          <stop offset="55%" stopColor="#ffb547" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ambient">
          <stop offset="0%" stopColor="#ffb86b" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#ffb86b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="windowSpill">
          <stop offset="0%" stopColor="#6d8cc4" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#6d8cc4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="windowGlow">
          <stop offset="0%" stopColor="#47608f" />
          <stop offset="100%" stopColor="#151c2b" />
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

      {/* Light spilling in from the windows, and a warm wash over the room. A
          dark room only reads as lit if something is actually casting light. */}
      <ellipse cx={iso(78, 14).u} cy={iso(78, 14).v} rx="30" ry="17" fill="url(#windowSpill)" />
      <ellipse cx={50} cy={HORIZON + SPREAD_Y} rx="52" ry="30" fill="url(#ambient)" />

      {/* Floorboards. Nothing says "floor" like floor lines. */}
      {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map((n) => (
        <g key={n} stroke="#4c3c2d" strokeWidth="0.13" opacity="0.55">
          <line x1={iso(n, 0).u} y1={iso(n, 0).v} x2={iso(n, 100).u} y2={iso(n, 100).v} />
          <line x1={iso(0, n).u} y1={iso(0, n).v} x2={iso(100, n).u} y2={iso(100, n).v} />
        </g>
      ))}

      {/* Zone rugs, drawn around wherever their people actually sit. */}
      {ZONES.map((zone) => {
        const [x0, y0, x1, y1] = zone.box;
        // The label sits on the rug's left corner, not its middle. In the
        // middle it was directly behind the desks and unreadable — which is
        // exactly where a centroid puts it, since that is where people sit.
        const tag = iso(x0, y1);
        return (
          <g key={zone.id}>
            <polygon points={slab(x0, y0, x1, y1)} fill={zone.tint} opacity="0.9" />
            <polygon
              points={slab(x0, y0, x1, y1)}
              fill="none"
              stroke={zone.edge}
              strokeWidth="0.25"
              opacity="0.9"
            />
            <text
              x={tag.u + 1.4}
              y={tag.v + 0.7}
              textAnchor="start"
              fontSize="1.85"
              fontWeight="600"
              fill="#b5a290"
              opacity="0.85"
              letterSpacing="0.4"
              style={{ textTransform: "uppercase" }}
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {/* Furniture, back to front. */}
      {bots.map((bot) => (
        <Workstation key={bot._id} bot={bot} />
      ))}
    </svg>
  );
}

/**
 * One workstation, drawn back to front: chair, then the person, then the desk
 * in front of them so it hides their lap and they read as seated, then the
 * monitor on the desk beside them.
 */
function Workstation({ bot }: { bot: Bot }) {
  const { x, y } = bot.desk;
  const status = STATUS[bot.status];
  const off = bot.status === "off_shift";
  const working = bot.status === "working";
  const look = LOOK[bot.key] ?? DEFAULT_LOOK;

  const top = iso(x - DESK_W, y - DESK_D);
  const right = iso(x + DESK_W, y - DESK_D);
  const bottom = iso(x + DESK_W, y + DESK_D);
  const left = iso(x - DESK_W, y + DESK_D);
  const frontEdge = iso(x, y + DESK_D);

  // Behind the desk, facing us. The desk is drawn afterwards and covers them
  // from the waist down, which is what makes them look like they are sitting.
  const seat = iso(x + 1, y - DESK_D - 2);
  // The monitor lives on the desk beside them, not in front of their face.
  const screen = iso(x - 5.5, y - 2.5);

  return (
    <g opacity={off ? 0.42 : 1}>
      <ellipse
        cx={frontEdge.u}
        cy={frontEdge.v - 1}
        rx="14"
        ry="7.5"
        fill={working ? "url(#lampPoolHot)" : "url(#lampPool)"}
        className={working ? "anim-lamp" : ""}
      />

      {/* Chair back, behind them. */}
      <rect
        x={seat.u - 2.05}
        y={seat.v - 2.95}
        width="4.1"
        height="3.7"
        rx="1.05"
        fill="#2a221b"
        stroke="#3d3228"
        strokeWidth="0.14"
      />

      <g className={working ? "anim-typing" : off ? "" : "anim-breathe"}>
        {/* Torso and shoulders. */}
        <path
          d={`M ${seat.u - 1.9} ${seat.v + 0.9}
              Q ${seat.u - 1.75} ${seat.v - 1.4} ${seat.u} ${seat.v - 1.65}
              Q ${seat.u + 1.75} ${seat.v - 1.4} ${seat.u + 1.9} ${seat.v + 0.9} Z`}
          fill={look.shirt}
        />
        {/* Arms, reaching towards the desk. */}
        <ellipse cx={seat.u - 1.72} cy={seat.v - 0.1} rx="0.55" ry="1.05" fill={look.sleeve} />
        <ellipse cx={seat.u + 1.72} cy={seat.v - 0.1} rx="0.55" ry="1.05" fill={look.sleeve} />
        {/* Neck, head, hair. */}
        <rect x={seat.u - 0.4} y={seat.v - 2.3} width="0.8" height="0.9" fill={look.skin} />
        <circle cx={seat.u} cy={seat.v - 2.85} r="0.95" fill={look.skin} />
        <path
          d={`M ${seat.u - 0.95} ${seat.v - 2.92}
              a 0.95 0.95 0 0 1 1.9 0
              q -0.95 -0.5 -1.9 0 Z`}
          fill={look.hair}
        />
      </g>

      {/* Desk: two front faces give it thickness. */}
      <polygon
        points={`${pt(left)} ${pt(bottom)} ${bottom.u},${bottom.v + DESK_LIP} ${left.u},${left.v + DESK_LIP}`}
        fill="#33281e"
      />
      <polygon
        points={`${pt(bottom)} ${pt(right)} ${right.u},${right.v + DESK_LIP} ${bottom.u},${bottom.v + DESK_LIP}`}
        fill="#271f17"
      />
      <polygon
        points={`${pt(top)} ${pt(right)} ${pt(bottom)} ${pt(left)}`}
        fill="#4d3d2d"
        stroke="#6f5943"
        strokeWidth="0.18"
      />

      {/* Monitor. Its screen is the status light. */}
      <rect
        x={screen.u - 3.1}
        y={screen.v - 5.4}
        width="6.2"
        height="4.2"
        rx="0.45"
        fill="#100c09"
        stroke="#4a3b2e"
        strokeWidth="0.18"
      />
      <rect
        x={screen.u - 2.6}
        y={screen.v - 4.95}
        width="5.2"
        height="3.3"
        rx="0.25"
        fill={status.screen}
      />
      {working && (
        <rect
          x={screen.u - 2.1}
          y={screen.v - 4.3}
          width="0.5"
          height="1.1"
          fill="#7fe4ff"
          className="anim-typing"
        />
      )}
      <rect x={screen.u - 0.5} y={screen.v - 1.2} width="1" height="1" fill="#2b2119" />
      <rect x={screen.u - 1.6} y={screen.v - 0.3} width="3.2" height="0.5" rx="0.2" fill="#2b2119" />
    </g>
  );
}

// ── The people ──────────────────────────────────────────────────────────────
/**
 * The plaque on the front of the desk: who they are and what they do.
 *
 * The role is on the floor rather than only inside the desk drawer, because
 * "Sipho" tells you nothing on its own and the point of the room is to be
 * readable at a glance. The speech bubble goes above their head, not above the
 * plaque, so it reads as the person talking.
 */
function NamePlate({ bot, onOpen }: { bot: Bot; onOpen: () => void }) {
  const status = STATUS[bot.status];
  const needsYou = bot.status === "waiting_on_boss" || bot.openEscalations > 0;
  const speaks = SPEAKS.has(bot.status);

  const plate = iso(bot.desk.x, bot.desk.y + DESK_D);
  const head = iso(bot.desk.x + 1, bot.desk.y - DESK_D - 2);

  return (
    <>
      {speaks && (
        <div
          style={{
            left: `${head.u}%`,
            top: `${((head.v - 4.1) / VB.h) * 100}%`,
            zIndex: Math.round(plate.v * 10) + 1,
          }}
          className="anim-in pointer-events-none absolute w-[132px] -translate-x-1/2 -translate-y-full rounded-xl border border-edge bg-panel-2/95 px-2.5 py-1.5 text-[10.5px] leading-snug text-cream shadow-xl"
        >
          {bot.currentTask}
          <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-edge bg-panel-2" />
        </div>
      )}

      <button
        onClick={onOpen}
        title={bot.blurb}
        style={{
          left: `${plate.u}%`,
          top: `${(plate.v / VB.h) * 100}%`,
          zIndex: Math.round(plate.v * 10),
        }}
        className="group absolute -translate-x-1/2 -translate-y-[38%] focus:outline-none"
        aria-label={`${bot.name}, ${bot.role} — ${status.label}`}
      >
        <span
          className={`relative block whitespace-nowrap rounded-lg border bg-panel/95 px-2.5 py-1 text-left shadow-lg backdrop-blur-[2px] transition group-hover:-translate-y-0.5 group-hover:border-lamp/70 group-focus-visible:border-lamp ${
            bot.status === "off_shift" ? "border-edge opacity-55" : "border-edge-2"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span
              style={{ ["--ring-color" as string]: status.ring, background: status.ring }}
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${needsYou ? "anim-ring" : ""}`}
              title={status.label}
            />
            <span className="text-[11.5px] font-semibold leading-tight text-cream">{bot.name}</span>
            <span className="text-[10px] leading-none">{bot.avatar}</span>
          </span>
          <span className="mt-0.5 block text-[9.5px] leading-tight text-muted">{bot.role}</span>

          {needsYou && (
            <span className="absolute -right-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-rust text-[9.5px] font-bold text-white shadow">
              {bot.openEscalations || "!"}
            </span>
          )}
        </span>
      </button>
    </>
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
