import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/authed";
import { stamps, touch, alive, getAlive, softDelete } from "./lib/soft";
import { isOwnWebsite } from "../packages/shared/tools/sources";

/**
 * The call list.
 *
 * Roughly half of every qualified lead cannot be emailed at all: Google Maps
 * has no email field, and a small trade in Durban very often publishes a phone
 * number and nothing else. Lerato only sends email, so until now those leads
 * were qualified, scored, sat in the list, and were touched by nothing, ever.
 *
 * This is the other half of the funnel, and it is deliberately not automated.
 * Nothing here dials, and nothing here decides: a person rings a person, and
 * the only job of this file is to remember what happened so the next call
 * starts where the last one ended.
 */

/**
 * What to open the call with, and what not to.
 *
 * A lead's faults are only about the business if they were measured against
 * the business's own site. Where Maps returned a Facebook page or a WhatsApp
 * catalogue in the website box, the audit ran against that instead, and
 * "there's no contact form anywhere on the site" is a true sentence about
 * facebook.com. Reading it down the phone to a plumber is worse than saying
 * nothing, so where the site was not theirs the faults are not shown at all.
 *
 * The truth in that case is better anyway: they have no website. Naming what
 * they do have is more use on a call than a fault list would have been.
 */
function whatToMention(lead: {
  hasWebsite: boolean;
  websiteUrl: string;
  faults: { detail: string }[];
}): string | null {
  if (lead.hasWebsite && isOwnWebsite(lead.websiteUrl)) {
    return lead.faults[0]?.detail ?? null;
  }
  if (/facebook\.com/i.test(lead.websiteUrl)) {
    return "They have no website — just a Facebook page.";
  }
  if (/wa\.me|whatsapp/i.test(lead.websiteUrl)) {
    return "They have no website — just a WhatsApp catalogue.";
  }
  return "They have no website at all.";
}

/** What each outcome means for the lead itself. */
const MOVES_LEAD_TO: Record<string, string | null> = {
  no_answer: null,
  left_message: null,
  spoke: null,
  call_back: null,
  not_interested: "no",
  wrong_number: "discarded",
  meeting_booked: "call_booked",
};

/** How long a no-answer rests before it is worth another try. */
const RETRY_AFTER_HOURS = 24;

export const queue = authedQuery({
  args: { includeDone: v.optional(v.boolean()) },
  handler: async (ctx, { includeDone }) => {
    const leads = alive(await ctx.db.query("leads").collect()).filter((l) => {
      const reachable = l.mobile !== "not_found" || l.landline !== "not_found";
      if (!reachable) return false;
      // Anything email can reach belongs to Lerato, not to a phone call.
      if (l.emailStatus === "published") return false;
      return includeDone
        ? ["qualified", "call_booked", "no", "not_now"].includes(l.status)
        : l.status === "qualified";
    });

    const rows = [];
    for (const lead of leads) {
      const calls = alive(
        await ctx.db.query("calls").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect(),
      ).sort((a, b) => b.createdAt - a.createdAt);

      const last = calls[0] ?? null;
      // A number rung an hour ago is not the next number to ring.
      const restingUntil =
        last?.outcome === "call_back" && last.callBackAt
          ? last.callBackAt
          : last && ["no_answer", "left_message"].includes(last.outcome)
            ? last.createdAt + RETRY_AFTER_HOURS * 3_600_000
            : null;

      rows.push({
        lead,
        mention: whatToMention(lead),
        calls,
        attempts: calls.length,
        last,
        dueAt: restingUntil,
        waiting: restingUntil !== null && restingUntil > Date.now(),
      });
    }

    // Never rung first, then by score. Anything resting sinks to the bottom
    // rather than disappearing, so "who do I ring next" is the top of the list.
    return rows.sort((a, b) => {
      if (a.waiting !== b.waiting) return a.waiting ? 1 : -1;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return b.lead.score - a.lead.score;
    });
  },
});

export const counts = authedQuery({
  args: {},
  handler: async (ctx) => {
    const leads = alive(await ctx.db.query("leads").collect()).filter(
      (l) =>
        (l.mobile !== "not_found" || l.landline !== "not_found") &&
        l.emailStatus !== "published" &&
        l.status === "qualified",
    );
    const calls = alive(await ctx.db.query("calls").collect());
    const rung = new Set(calls.map((c) => c.leadId));
    const since = Date.now() - 7 * 24 * 3_600_000;

    return {
      toCall: leads.length,
      neverRung: leads.filter((l) => !rung.has(l._id)).length,
      callsThisWeek: calls.filter((c) => c.createdAt >= since).length,
      booked: calls.filter((c) => c.outcome === "meeting_booked" && c.createdAt >= since).length,
    };
  },
});

/**
 * Record a call.
 *
 * The lead moves only where the outcome leaves no doubt — a booking, a no, a
 * wrong number. "No answer" and "left a message" move nothing, because they
 * say something about the phone rather than about the business.
 */
export const log = authedMutation({
  args: {
    leadId: v.id("leads"),
    outcome: v.union(
      v.literal("no_answer"),
      v.literal("left_message"),
      v.literal("spoke"),
      v.literal("call_back"),
      v.literal("not_interested"),
      v.literal("wrong_number"),
      v.literal("meeting_booked"),
    ),
    note: v.optional(v.string()),
    callBackAt: v.optional(v.number()),
  },
  handler: async (ctx, { leadId, outcome, note, callBackAt }) => {
    const lead = await getAlive(ctx, leadId);
    if (!lead) throw new Error("That lead no longer exists.");

    await ctx.db.insert("calls", {
      leadId,
      outcome,
      note: note?.trim() || undefined,
      callBackAt: outcome === "call_back" ? callBackAt : undefined,
      ...stamps(),
    });

    const moveTo = MOVES_LEAD_TO[outcome];
    if (moveTo) {
      await ctx.db.patch(leadId, {
        status: moveTo as never,
        ...(moveTo === "discarded"
          ? { discardReason: "Wrong number — no way to reach this business by phone." }
          : {}),
        ...touch(),
      });
    } else {
      await ctx.db.patch(leadId, { lastTouchAt: Date.now(), ...touch() });
    }

    await ctx.db.insert("leadEvents", {
      leadId,
      type: "called",
      detail: `You rang them: ${outcome.replace(/_/g, " ")}${note?.trim() ? ` — ${note.trim()}` : ""}.`,
      botKey: "boss",
      ...stamps(),
    });

    return { ok: true, movedTo: moveTo };
  },
});

/** Undo a call logged by mistake. The lead's own status is left as it is. */
export const remove = authedMutation({
  args: { id: v.id("calls") },
  handler: async (ctx, { id }) => {
    await softDelete(ctx, id);
  },
});
