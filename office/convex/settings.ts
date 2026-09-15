import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ensureSettings, readSettings, SETTINGS_KEY } from "./lib/settings";
import { stamps, touch, alive } from "./lib/soft";
import { BOTS } from "../packages/agents/registry";

/** Cheap, hot query — called at the top of every action. Keep it small. */
export const haltState = query({
  args: {},
  handler: async (ctx): Promise<{ halted: boolean; reason?: string }> => {
    const s = await readSettings(ctx);
    return { halted: s?.killSwitch.active ?? false, reason: s?.killSwitch.reason };
  },
});

export const sendState = query({
  args: {},
  handler: async (ctx) => {
    const s = await readSettings(ctx);
    return {
      halted: s?.killSwitch.active ?? false,
      reason: s?.killSwitch.reason,
      paused: s?.pauseSending ?? false,
      holdForApproval: s?.holdForApproval ?? false,
      senderEmail: s?.senderEmail ?? "",
      senderName: s?.senderName ?? "The Creative Current",
      replyToEmail: s?.replyToEmail ?? "",
      bookingUrl: s?.bookingUrl ?? "",
      dailySendCap: s?.dailySendCap ?? 20,
      similarityCeiling: s?.similarityCeiling ?? 0.82,
    };
  },
});

export const get = query({
  args: {},
  handler: async (ctx) => await readSettings(ctx),
});

/**
 * Which integrations are actually wired up, read from the live environment.
 *
 * This used to be a stored set of flags that a "deploy script" was supposed to
 * keep current. No such step existed, so every row read "not connected" for
 * ever, including for keys that were working perfectly — a panel whose entire
 * job is to tell you what is connected, confidently telling you the opposite.
 *
 * Derived on read instead. Convex exposes its environment to queries, so this
 * cannot drift from reality, and it reports only presence — never a value.
 */
export const integrationStatus = query({
  args: {},
  handler: async (ctx) => {
    const s = await readSettings(ctx);
    const set = (name: string) => Boolean(process.env[name]);
    return {
      gemini: set("GEMINI_API_KEY"),
      groq: set("GROQ_API_KEY"),
      resend: set("RESEND_API_KEY"),
      searchConsole: set("GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN"),
      googleAds: set("GOOGLE_ADS_REFRESH_TOKEN"),
      passcode: set("OFFICE_PASSCODE") && set("OFFICE_TOKEN_SECRET"),
      // Sending needs a key AND somewhere to send from; either missing is a no.
      canSend: set("RESEND_API_KEY") && Boolean(s?.senderEmail),
    };
  },
});

export const budgetFor = query({
  args: { botKey: v.string() },
  handler: async (ctx, { botKey }) => {
    const s = await readSettings(ctx);
    const override = (s?.budgets ?? {})[botKey];
    if (typeof override === "number") return override;
    return BOTS.find((b) => b.key === botKey)?.dailyBudget ?? 50;
  },
});

/**
 * STOP. Halts every outbound action and puts all bots off shift.
 * Lifting it does NOT bring bots back on shift automatically — that is a
 * separate, deliberate act, so nothing resumes by surprise.
 */
export const setKillSwitch = mutation({
  args: { active: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { active, reason }) => {
    const s = await ensureSettings(ctx);
    await ctx.db.patch(s._id, {
      killSwitch: active
        ? { active: true, activatedAt: Date.now(), reason: reason ?? "Stopped by the boss" }
        : { active: false },
      ...touch(),
    });

    const bots = alive(await ctx.db.query("bots").collect());
    for (const bot of bots) {
      if (active) {
        await ctx.db.patch(bot._id, {
          status: "off_shift",
          currentTask: "Stopped by the boss",
          ...touch(),
        });
      } else if (bot.status === "off_shift") {
        await ctx.db.patch(bot._id, { status: "idle", currentTask: "Back on shift", ...touch() });
      }
    }

    // Drain anything queued to go out.
    if (active) {
      const queued = alive(
        await ctx.db.query("emails").withIndex("by_status", (q) => q.eq("status", "queued")).collect(),
      );
      for (const e of queued) {
        await ctx.db.patch(e._id, {
          status: "blocked",
          error: "STOP was engaged before this could send.",
          ...touch(),
        });
      }
      const jobs = alive(
        await ctx.db.query("scrapeJobs").withIndex("by_status", (q) => q.eq("status", "queued")).collect(),
      );
      for (const j of jobs) {
        await ctx.db.patch(j._id, { status: "failed", error: "STOP engaged.", ...touch() });
      }
      await ctx.db.insert("escalations", {
        botKey: "orchestrator",
        title: "STOP engaged",
        detail: `All outbound action halted. ${queued.length} queued email(s) and ${jobs.length} scrape job(s) were dropped. Reason: ${reason ?? "not given"}.`,
        severity: "urgent",
        status: "open",
        ...stamps(),
      });
    }
    return { active };
  },
});

export const setKillSwitchInternal = internalMutation({
  args: { active: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { active, reason }) => {
    const s = await ensureSettings(ctx);
    await ctx.db.patch(s._id, {
      killSwitch: active ? { active: true, activatedAt: Date.now(), reason } : { active: false },
      ...touch(),
    });
  },
});

export const setPauseSending = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, { paused }) => {
    const s = await ensureSettings(ctx);
    await ctx.db.patch(s._id, { pauseSending: paused, ...touch() });
    return { paused };
  },
});

export const update = mutation({
  args: {
    senderEmail: v.optional(v.string()),
    senderName: v.optional(v.string()),
    replyToEmail: v.optional(v.string()),
    bookingUrl: v.optional(v.string()),
    dailySendCap: v.optional(v.number()),
    similarityCeiling: v.optional(v.number()),
    budgets: v.optional(v.any()),
    pricingYaml: v.optional(v.string()),
    holdForApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const s = await ensureSettings(ctx);
    const patch: Record<string, unknown> = { ...touch() };
    for (const [k, val] of Object.entries(args)) {
      if (val !== undefined) patch[k] = val;
    }
    // The send cap is a safety rail, not a dial. 20/day is the policy.
    if (typeof patch.dailySendCap === "number") {
      patch.dailySendCap = Math.max(0, Math.min(20, patch.dailySendCap));
    }
    await ctx.db.patch(s._id, patch);
    return await ctx.db.get(s._id);
  },
});

/** Called by the local worker's heartbeat so the UI can show it as online. */
export const workerHeartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const s = await ensureSettings(ctx);
    await ctx.db.patch(s._id, { workerLastSeenAt: Date.now(), ...touch() });
    return { ok: true };
  },
});
