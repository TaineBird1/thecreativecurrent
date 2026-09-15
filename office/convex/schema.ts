import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The Creative Current Office — data model.
 *
 * Two rules hold across every table:
 *   1. Every table carries createdAt / updatedAt / deletedAt (epoch ms).
 *   2. Nothing is ever hard-deleted. `deletedAt` is set and every query
 *      filters it out. See convex/lib/soft.ts for the helpers that enforce it.
 */

// Shared timestamp columns. Spread into every table definition.
const stamps = {
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
};

export const botStatus = v.union(
  v.literal("idle"),
  v.literal("working"),
  v.literal("waiting_on_boss"),
  v.literal("blocked"),
  v.literal("off_shift"),
);

export const department = v.union(
  v.literal("leadership"),
  v.literal("revenue"),
  v.literal("marketing"),
  v.literal("client_success"),
);

export const taskStatus = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("failed"),
);

export const leadStatus = v.union(
  v.literal("new"),
  v.literal("qualified"),
  v.literal("discarded"),
  v.literal("queued"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("interested"),
  v.literal("not_now"),
  v.literal("no"),
  v.literal("call_booked"),
  v.literal("won"),
  v.literal("lost"),
);

/** Which guard caught an artefact and sent it to Approvals. */
export const guardKind = v.union(
  v.literal("money"),
  v.literal("claims"),
  v.literal("policy"),
  v.literal("manual"),
);

export default defineSchema({
  // ───────────────────────── The employees ─────────────────────────
  bots: defineTable({
    key: v.string(), // stable id: "orchestrator", "leadgen", ...
    name: v.string(), // the character's name
    role: v.string(), // "Orchestrator / CEO"
    department,
    blurb: v.string(), // one line, shown on the desk drawer
    avatar: v.string(), // emoji/initials used by the office renderer
    desk: v.object({ zone: v.string(), x: v.number(), y: v.number() }),
    status: botStatus,
    currentTask: v.string(), // speech bubble text, <= 8 words
    systemPrompt: v.string(), // live prompt. Editable in-app.
    promptEditedAt: v.optional(v.number()), // set => in-app edit wins over prompt.md
    tools: v.array(v.string()), // every tool this bot may call
    toolsDisabled: v.array(v.string()), // toggled off in the UI
    scheduleCron: v.optional(v.string()), // UTC cron, documented in SAST
    scheduleLabel: v.string(), // human text: "Daily 07:00 SAST"
    scheduleEnabled: v.boolean(),
    dailyBudget: v.number(), // max LLM requests per day
    lastRunAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    ...stamps,
  })
    .index("by_key", ["key"])
    .index("by_status", ["status"]),

  // ───────────────────────── Work ─────────────────────────
  goals: defineTable({
    text: v.string(),
    detail: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("achieved"), v.literal("abandoned")),
    targetDate: v.optional(v.string()), // YYYY-MM-DD
    plannedAt: v.optional(v.number()), // when the Orchestrator broke it down
    ...stamps,
  }).index("by_status", ["status"]),

  tasks: defineTable({
    goalId: v.optional(v.id("goals")),
    botKey: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    status: taskStatus,
    priority: v.number(), // 1 highest
    retries: v.number(),
    maxRetries: v.number(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    ...stamps,
  })
    .index("by_status", ["status"])
    .index("by_bot", ["botKey", "status"])
    .index("by_goal", ["goalId"]),

  runs: defineTable({
    botKey: v.string(),
    trigger: v.union(
      v.literal("cron"),
      v.literal("manual"),
      v.literal("orchestrator"),
      v.literal("chat"),
    ),
    taskId: v.optional(v.id("tasks")),
    status: v.union(
      v.literal("running"),
      v.literal("ok"),
      v.literal("error"),
      v.literal("halted"), // kill switch tripped mid-run
      v.literal("budget_exceeded"),
    ),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    ...stamps,
  })
    .index("by_bot", ["botKey"])
    .index("by_started", ["startedAt"]),

  // ───────────────────────── Observability ─────────────────────────
  llmCalls: defineTable({
    botKey: v.string(),
    runId: v.optional(v.id("runs")),
    purpose: v.string(), // "qualify_lead", "draft_outreach", ...
    provider: v.union(v.literal("gemini"), v.literal("groq")),
    model: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    latencyMs: v.number(),
    attempt: v.number(),
    fellBack: v.boolean(), // true => Gemini refused, Groq answered
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("rate_limited")),
    error: v.optional(v.string()),
    day: v.string(), // YYYY-MM-DD in SAST, for budget rollups
    ...stamps,
  })
    .index("by_bot_day", ["botKey", "day"])
    .index("by_created", ["createdAt"]),

  toolCalls: defineTable({
    botKey: v.string(),
    runId: v.optional(v.id("runs")),
    tool: v.string(),
    args: v.string(), // JSON, already pseudonymised
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("blocked")),
    durationMs: v.number(),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    ...stamps,
  })
    .index("by_bot", ["botKey"])
    .index("by_created", ["createdAt"]),

  /** Token-bucket + daily-budget state. Must be in the DB: actions are stateless. */
  rateLimits: defineTable({
    key: v.string(), // "provider:gemini" | "budget:leadgen:2026-09-14"
    tokens: v.number(),
    count: v.number(),
    windowStart: v.number(),
    lastRefillAt: v.number(),
    ...stamps,
  }).index("by_key", ["key"]),

  // ───────────────────────── Leads ─────────────────────────
  leads: defineTable({
    businessName: v.string(),
    contactName: v.optional(v.string()),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(), // "plumber", "guest house", ...

    // Contact enrichment. Every field is either a real value or "not_found" —
    // never blank, never invented.
    mobile: v.string(), // +27... formatted for WhatsApp, or "not_found"
    landline: v.string(),
    email: v.string(),
    emailStatus: v.union(
      v.literal("published"), // scraped from their own site/listing
      v.literal("inferred"), // guessed from the domain pattern
      v.literal("not_found"),
    ),
    facebookUrl: v.string(),
    websiteUrl: v.string(),
    address: v.string(),
    suburb: v.string(),

    hasWebsite: v.boolean(),
    // Structured faults so Outreach can quote one verbatim.
    faults: v.array(
      v.object({
        code: v.string(), // "no_mobile_responsive", "no_contact_form", ...
        detail: v.string(), // human sentence, safe to paste into an email
        severity: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      }),
    ),
    loadSeconds: v.optional(v.number()),
    screenshotDesktop: v.optional(v.id("_storage")),
    screenshotMobile: v.optional(v.id("_storage")),
    facebookActivity: v.optional(v.string()), // what the FB page does instead of a site

    score: v.number(), // 0-100 qualification score
    status: leadStatus,
    discardReason: v.optional(v.string()), // why an off-niche lead was dropped
    source: v.string(), // "snupit", "google_maps", "mba_kzn", ...
    sourceUrl: v.string(),
    dedupeKey: v.string(), // normalised domain, else name+suburb
    auditedAt: v.optional(v.number()),
    lastTouchAt: v.optional(v.number()),
    ...stamps,
  })
    .index("by_status", ["status"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_tier", ["tier", "status"])
    .index("by_score", ["score"]),

  leadEvents: defineTable({
    leadId: v.id("leads"),
    type: v.string(), // "discovered", "audited", "emailed", "replied", ...
    detail: v.string(),
    botKey: v.string(),
    ...stamps,
  }).index("by_lead", ["leadId"]),

  // ───────────────────────── Email ─────────────────────────
  emails: defineTable({
    leadId: v.optional(v.id("leads")),
    clientId: v.optional(v.id("clients")),
    direction: v.union(v.literal("out"), v.literal("in")),
    to: v.string(),
    from: v.string(),
    subject: v.string(),
    body: v.string(), // full text, always logged
    // The body with this prospect's own details stripped out. Stored at send
    // time so the template check can compare like with like cheaply — see
    // packages/shared/guards/similarity.ts.
    bodySkeleton: v.optional(v.string()),
    sequenceStep: v.optional(v.number()), // 1 = first touch, 2/3 = follow-ups
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("received"),
      v.literal("blocked"), // a guard stopped it
    ),
    providerId: v.optional(v.string()), // Resend message id
    classification: v.optional(
      v.union(
        v.literal("interested"),
        v.literal("not_now"),
        v.literal("no"),
        v.literal("question"),
        v.literal("auto_reply"),
      ),
    ),
    botKey: v.string(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    ...stamps,
  })
    .index("by_lead", ["leadId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  sequences: defineTable({
    leadId: v.id("leads"),
    step: v.number(), // 0 = not started, 1..3 = sent that many
    nextSendAt: v.optional(v.number()),
    stopped: v.boolean(),
    stopReason: v.optional(v.string()), // "replied", "bounced", "boss_stopped"
    ...stamps,
  })
    .index("by_lead", ["leadId"])
    .index("by_next", ["stopped", "nextSendAt"]),

  // ───────────────────────── Clients ─────────────────────────
  clients: defineTable({
    businessName: v.string(),
    contactName: v.string(),
    email: v.string(),
    mobile: v.string(),
    siteUrl: v.string(),
    carePlanTier: v.union(
      v.literal("essential"), // R650
      v.literal("growth"), // R1,100
      v.literal("priority"), // R1,750
    ),
    monthlyFee: v.number(),
    renewalDate: v.optional(v.string()), // YYYY-MM-DD
    uptimePercent30d: v.number(),
    lastCheckAt: v.optional(v.number()),
    lastStatusCode: v.optional(v.number()),
    lastDownAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    ...stamps,
  }).index("by_name", ["businessName"]),

  uptimeChecks: defineTable({
    clientId: v.id("clients"),
    ok: v.boolean(),
    statusCode: v.optional(v.number()),
    responseMs: v.optional(v.number()),
    error: v.optional(v.string()),
    ...stamps,
  }).index("by_client", ["clientId", "createdAt"]),

  changeRequests: defineTable({
    clientId: v.id("clients"),
    description: v.string(),
    submittedBy: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("needs_approval"), // has a cost attached
    ),
    costFlagged: v.boolean(),
    approvalId: v.optional(v.id("approvals")),
    ...stamps,
  }).index("by_client", ["clientId"]).index("by_status", ["status"]),

  // ───────────────────────── The gate ─────────────────────────
  approvals: defineTable({
    kind: v.string(), // "outreach_email" | "proposal" | "contract" | "ad_spend" | ...
    botKey: v.string(),
    title: v.string(),
    body: v.string(), // the artefact itself, verbatim
    reason: v.string(), // what tripped, in plain words
    guard: guardKind,
    matches: v.array(v.string()), // exact phrases that tripped the guard
    payload: v.optional(v.any()), // what to do on approve (e.g. { sendTo, leadId })
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired"),
    ),
    editedBody: v.optional(v.string()), // boss edited before approving
    note: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    leadId: v.optional(v.id("leads")),
    clientId: v.optional(v.id("clients")),
    ...stamps,
  })
    .index("by_status", ["status"])
    .index("by_bot", ["botKey"]),

  escalations: defineTable({
    botKey: v.string(),
    title: v.string(),
    detail: v.string(),
    severity: v.union(v.literal("info"), v.literal("warn"), v.literal("urgent")),
    status: v.union(v.literal("open"), v.literal("resolved")),
    note: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    ...stamps,
  })
    .index("by_status", ["status"])
    .index("by_bot", ["botKey", "status"]),

  standups: defineTable({
    forDate: v.string(), // YYYY-MM-DD (SAST)
    yesterday: v.string(),
    today: v.string(),
    needsYou: v.string(),
    ...stamps,
  }).index("by_date", ["forDate"]),

  // ───────────────────────── Library ─────────────────────────
  contentDrafts: defineTable({
    botKey: v.string(),
    kind: v.union(
      v.literal("blog"),
      v.literal("linkedin"),
      v.literal("instagram"),
      v.literal("newsletter"),
      v.literal("video_script"),
      v.literal("ad_copy"),
      v.literal("proposal"),
      v.literal("contract"),
    ),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("needs_approval"),
      v.literal("approved"),
      v.literal("posted_by_boss"), // bots never post; this is you ticking it off
    ),
    calendarDate: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
    ...stamps,
  })
    .index("by_kind", ["kind"])
    .index("by_status", ["status"]),

  mediaAssets: defineTable({
    botKey: v.string(),
    kind: v.union(
      v.literal("image"),
      v.literal("thumbnail"),
      v.literal("storyboard"),
      v.literal("brand_graphic"),
    ),
    title: v.string(),
    prompt: v.string(),
    provider: v.string(), // "pollinations" | "gemini" | "stub"
    url: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    tags: v.array(v.string()),
    ...stamps,
  }).index("by_kind", ["kind"]),

  // ───────────────────────── Reporting ─────────────────────────
  kpiSnapshots: defineTable({
    date: v.string(), // YYYY-MM-DD (SAST)
    period: v.union(v.literal("day"), v.literal("week")),
    leadsFound: v.number(),
    emailsSent: v.number(),
    replies: v.number(),
    callsBooked: v.number(),
    proposalsOut: v.number(),
    wins: v.number(),
    contentPublished: v.number(),
    mrr: v.number(),
    llmCalls: v.number(),
    ...stamps,
  }).index("by_date", ["period", "date"]),

  // ───────────────────────── Config ─────────────────────────
  settings: defineTable({
    key: v.string(), // singleton: "global"

    // Kill switch. Stored, not in memory, so it survives restarts and deploys.
    killSwitch: v.object({
      active: v.boolean(),
      activatedAt: v.optional(v.number()),
      reason: v.optional(v.string()),
    }),
    // Separate, weaker switch: stops sending, bots keep thinking.
    pauseSending: v.boolean(),
    // Weaker still: bots write as normal, but every outbound email stops in
    // Approvals instead of going out. Pausing cannot do this job — Lerato
    // refuses to draft at all while sending is off, deliberately, so there is
    // no way to read what she would have written before a stranger does.
    holdForApproval: v.optional(v.boolean()),

    senderEmail: v.string(), // "" => sending is disabled entirely
    senderName: v.string(),
    replyToEmail: v.string(),
    bookingUrl: v.string(), // Cal.com link
    dailySendCap: v.number(), // 20
    similarityCeiling: v.number(), // 0.82 — above this it's a template, not a letter

    budgets: v.any(), // { [botKey]: number }
    pricingYaml: v.string(), // config/pricing.yaml, editable in Settings

    integrations: v.object({
      gemini: v.boolean(),
      groq: v.boolean(),
      resend: v.boolean(),
      searchConsole: v.boolean(),
      googleAds: v.boolean(),
    }),

    workerLastSeenAt: v.optional(v.number()), // local Playwright worker heartbeat
    ...stamps,
  }).index("by_key", ["key"]),

  /** Work that needs a real browser. Leased by the local `pnpm worker` process. */
  scrapeJobs: defineTable({
    type: v.union(
      v.literal("audit_site"), // screenshots + fault scoring
      v.literal("directory"), // paginated directory crawl
      v.literal("facebook_page"), // public page HTML
    ),
    payload: v.any(),
    status: v.union(
      v.literal("queued"),
      v.literal("leased"),
      v.literal("done"),
      v.literal("failed"),
    ),
    priority: v.number(),
    attempts: v.number(),
    leasedAt: v.optional(v.number()),
    leasedBy: v.optional(v.string()),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
    leadId: v.optional(v.id("leads")),
    /** Set once every result in this job has been worked, so a batch isn't repeated. */
    consumedAt: v.optional(v.number()),
    /** How many of this job's results have been worked so far — a big batch spans runs. */
    consumedCount: v.optional(v.number()),
    ...stamps,
  })
    .index("by_status", ["status", "priority"])
    .index("by_lead", ["leadId"]),

  /** Passcode sessions. No user table — one boss, one passcode. */
  sessions: defineTable({
    token: v.string(),
    expiresAt: v.number(),
    ...stamps,
  }).index("by_token", ["token"]),
});
