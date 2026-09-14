/**
 * The roster. One entry per employee.
 *
 * This is the single source of truth for who exists, where they sit, what they
 * may call, when they run, and how much free-tier quota they get. The seed reads
 * it; the office floor plan reads it; the cron table reads it.
 *
 * Schedules are written in UTC because that is what Convex crons use. SAST is
 * UTC+2 all year (no DST), so every cron carries its SAST time in the label.
 */

export type BotKey =
  | "orchestrator"
  | "strategy"
  | "leadgen"
  | "outreach"
  | "proposal"
  | "content"
  | "seo"
  | "design"
  | "clientsuccess";

export type Department = "leadership" | "revenue" | "marketing" | "client_success";

export interface BotDef {
  key: BotKey;
  name: string;
  role: string;
  department: Department;
  blurb: string;
  avatar: string;
  /** Desk position within its zone, as a percentage of the zone box. */
  desk: { zone: string; x: number; y: number };
  tools: string[];
  scheduleCron?: string;
  scheduleLabel: string;
  scheduleEnabled: boolean;
  dailyBudget: number;
}

export const BOTS: BotDef[] = [
  {
    key: "orchestrator",
    name: "Nomsa",
    role: "Orchestrator / CEO",
    department: "leadership",
    blurb:
      "Turns your goals into tasks, assigns them, chases them, and writes your morning stand-up.",
    avatar: "🧭",
    desk: { zone: "leadership", x: 28, y: 42 },
    tools: ["plan_goal", "assign_task", "replan_task", "write_standup", "read_kpis"],
    scheduleCron: "0 5 * * *", // 07:00 SAST
    scheduleLabel: "Daily 07:00 SAST + on demand",
    scheduleEnabled: true,
    dailyBudget: 120,
  },
  {
    key: "strategy",
    name: "Thabo",
    role: "Strategy / Analyst",
    department: "leadership",
    blurb:
      "Competitor research, the weekly KPI report, and the content calendar everyone else works from.",
    avatar: "📊",
    desk: { zone: "leadership", x: 68, y: 52 },
    tools: ["fetch_page", "summarise_competitor", "weekly_kpis", "build_content_calendar"],
    scheduleCron: "0 4 * * 1", // Monday 06:00 SAST
    scheduleLabel: "Mondays 06:00 SAST + ad-hoc",
    scheduleEnabled: true,
    dailyBudget: 100,
  },
  {
    key: "leadgen",
    name: "Sipho",
    role: "Lead Generation",
    department: "revenue",
    blurb:
      "Finds trade businesses that are invisible online, enriches every contact field, and audits their site for faults.",
    avatar: "🔎",
    desk: { zone: "revenue", x: 20, y: 38 },
    tools: [
      "search_directories",
      "fetch_page",
      "enrich_contact",
      "queue_site_audit",
      "qualify_lead",
      "dedupe_lead",
    ],
    scheduleCron: "0 6 * * 1-5", // 08:00 SAST weekdays
    scheduleLabel: "Weekdays 08:00 SAST",
    scheduleEnabled: true,
    dailyBudget: 250,
  },
  {
    key: "outreach",
    name: "Lerato",
    role: "Outreach / Sales",
    department: "revenue",
    blurb:
      "Writes the first email one at a time, follows up on day 3 and day 8, stops dead on a reply, and books the call.",
    avatar: "✉️",
    desk: { zone: "revenue", x: 52, y: 30 },
    tools: [
      "draft_first_email",
      "draft_followup",
      "send_email",
      "classify_reply",
      "draft_reply",
      "make_ics",
    ],
    scheduleCron: "0,30 6-15 * * 1-5", // every 30 min, 08:00-17:30 SAST weekdays
    scheduleLabel: "Every 30 min, 08:00–17:00 SAST weekdays",
    scheduleEnabled: true,
    dailyBudget: 300,
  },
  {
    key: "proposal",
    name: "Anele",
    role: "Proposals / Quotes",
    department: "revenue",
    blurb:
      "Turns your call notes into a proposal and contract. Always stops at Approvals — never sends.",
    avatar: "📄",
    desk: { zone: "revenue", x: 82, y: 44 },
    tools: ["draft_proposal", "draft_contract", "read_pricing"],
    scheduleLabel: "On demand only",
    scheduleEnabled: true,
    dailyBudget: 60,
  },
  {
    key: "content",
    name: "Zanele",
    role: "Content",
    department: "marketing",
    blurb:
      "Blog, LinkedIn, Instagram, the newsletter and video scripts. Drafts only — you post.",
    avatar: "✍️",
    desk: { zone: "marketing", x: 24, y: 40 },
    tools: ["read_calendar", "draft_content", "save_draft"],
    scheduleCron: "0 7 * * 1,3", // Mon & Wed 09:00 SAST
    scheduleLabel: "Mondays & Wednesdays 09:00 SAST",
    scheduleEnabled: true,
    dailyBudget: 200,
  },
  {
    key: "seo",
    name: "Kagiso",
    role: "SEO / Ads",
    department: "marketing",
    blurb:
      "Keyword research from free sources, on-page audits, ad copy. Any spend suggestion goes to Approvals.",
    avatar: "📈",
    desk: { zone: "marketing", x: 58, y: 52 },
    tools: [
      "google_autocomplete",
      "scrape_paa",
      "audit_onpage",
      "draft_ad_copy",
      "search_console",
    ],
    scheduleCron: "0 8 * * 2", // Tuesday 10:00 SAST
    scheduleLabel: "Tuesdays 10:00 SAST",
    scheduleEnabled: true,
    dailyBudget: 120,
  },
  {
    key: "design",
    name: "Naledi",
    role: "Design / Media",
    department: "marketing",
    blurb:
      "Thumbnails, social images, brand graphics and storyboards. No rendered video — no free option exists.",
    avatar: "🎨",
    desk: { zone: "marketing", x: 86, y: 38 },
    tools: ["generate_image", "draft_storyboard", "save_media"],
    scheduleCron: "0 9 * * 4", // Thursday 11:00 SAST
    scheduleLabel: "Thursdays 11:00 SAST",
    scheduleEnabled: true,
    dailyBudget: 80,
  },
  {
    key: "clientsuccess",
    name: "Bongi",
    role: "Client Success",
    department: "client_success",
    blurb:
      "Watches client sites, writes the monthly health check, drafts renewals and check-ins. Costs go to Approvals.",
    avatar: "🤝",
    desk: { zone: "client_success", x: 46, y: 44 },
    tools: [
      "ping_site",
      "health_check",
      "draft_checkin",
      "draft_renewal",
      "triage_change_request",
    ],
    scheduleCron: "0 */4 * * *", // uptime sweep every 4h
    scheduleLabel: "Uptime every 4h · health check monthly",
    scheduleEnabled: true,
    dailyBudget: 80,
  },
];

export const BOT_BY_KEY: Record<string, BotDef> = Object.fromEntries(
  BOTS.map((b) => [b.key, b]),
);

/** Office zones, used by the floor plan renderer. */
export const ZONES = [
  { id: "leadership", label: "Leadership", sub: "corner office" },
  { id: "revenue", label: "Revenue", sub: "the pod that pays for everything" },
  { id: "marketing", label: "Marketing", sub: "studio side" },
  { id: "client_success", label: "Client Success", sub: "by reception" },
] as const;
