import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Schedules.
 *
 * Convex crons run in UTC. SAST is UTC+2 all year with no daylight saving, so
 * every entry below is written as UTC with its SAST time in the comment. Getting
 * this wrong by two hours would mean cold emails landing at 06:00, so the
 * conversion lives in exactly one place and is never done by hand elsewhere —
 * see convex/lib/time.ts.
 *
 * Every job re-checks the kill switch when it runs (withRun does it first
 * thing), so a STOP takes effect immediately rather than at the next tick.
 */
const crons = cronJobs();

// ── Leadership ───────────────────────────────────────────────────────────────
crons.cron(
  "orchestrator morning standup", // 07:00 SAST
  "0 5 * * *",
  internal.agents.orchestrator.run,
  { trigger: "cron" },
);

crons.cron(
  "strategy weekly report", // Mondays 06:00 SAST
  "0 4 * * 1",
  internal.agents.strategy.run,
  { trigger: "cron" },
);

// ── Revenue ──────────────────────────────────────────────────────────────────
crons.cron(
  "leadgen daily sweep", // 08:00 SAST, weekdays
  "0 6 * * 1-5",
  internal.agents.leadgen.run,
  { trigger: "cron" },
);

crons.cron(
  // Every 30 minutes across 08:00-17:30 SAST. The bot checks office hours again
  // itself, so a cron that drifts can never send at midnight.
  "outreach send window",
  "0,30 6-15 * * 1-5",
  internal.agents.outreach.run,
  { trigger: "cron" },
);

// ── Marketing ────────────────────────────────────────────────────────────────
crons.cron(
  "content drafting", // Mondays & Wednesdays 09:00 SAST
  "0 7 * * 1,3",
  internal.agents.content.run,
  { trigger: "cron" },
);

crons.cron(
  "seo research", // Tuesdays 10:00 SAST
  "0 8 * * 2",
  internal.agents.seo.run,
  { trigger: "cron" },
);

crons.cron(
  "design assets", // Thursdays 11:00 SAST
  "0 9 * * 4",
  internal.agents.design.run,
  { trigger: "cron" },
);

// ── Client Success ───────────────────────────────────────────────────────────
crons.cron(
  // Uptime is the one thing worth checking round the clock — a client's site
  // being down at 02:00 still matters at 08:00.
  "client uptime sweep",
  "0 */4 * * *",
  internal.agents.clientsuccess.uptimeSweep,
  {},
);

crons.cron(
  "client monthly health check", // 1st of the month, 08:00 SAST
  "0 6 1 * *",
  internal.agents.clientsuccess.run,
  { trigger: "cron" },
);

// ── Housekeeping ─────────────────────────────────────────────────────────────
crons.cron(
  "daily kpi snapshot", // 23:30 SAST
  "30 21 * * *",
  internal.kpis.snapshot,
  {},
);

export default crons;
