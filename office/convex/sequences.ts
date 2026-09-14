import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { stamps, touch, alive } from "./lib/soft";
import { daysFromNow, nextSendWindow } from "./lib/time";

/** Day 3 and day 8, as briefed. */
const FOLLOW_UP_DAYS = [3, 8];

export const start = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const existing = await ctx.db
      .query("sequences")
      .withIndex("by_lead", (q) => q.eq("leadId", leadId))
      .unique();
    // Scheduled into the next weekday send window, so a Friday first touch
    // follows up on Monday morning rather than at 09:00 on a Saturday.
    const nextSendAt = nextSendWindow(daysFromNow(FOLLOW_UP_DAYS[0]));
    if (existing) {
      await ctx.db.patch(existing._id, { step: 1, nextSendAt, stopped: false, ...touch() });
      return existing._id;
    }
    return await ctx.db.insert("sequences", {
      leadId,
      step: 1,
      nextSendAt,
      stopped: false,
      ...stamps(),
    });
  },
});

export const advance = internalMutation({
  args: { id: v.id("sequences"), step: v.number() },
  handler: async (ctx, { id, step }) => {
    // Step 3 is the last one. There is no step 4, ever.
    const done = step >= 3;
    await ctx.db.patch(id, {
      step,
      stopped: done,
      stopReason: done ? "sequence_complete" : undefined,
      nextSendAt: done ? undefined : nextSendWindow(daysFromNow(FOLLOW_UP_DAYS[step - 1] - FOLLOW_UP_DAYS[step - 2])),
      ...touch(),
    });
  },
});

/** Stopping on a reply is absolute — called before anything else can fail. */
export const stop = internalMutation({
  args: { leadId: v.id("leads"), reason: v.string() },
  handler: async (ctx, { leadId, reason }) => {
    const seq = await ctx.db
      .query("sequences")
      .withIndex("by_lead", (q) => q.eq("leadId", leadId))
      .unique();
    if (!seq || seq.stopped) return;
    await ctx.db.patch(seq._id, {
      stopped: true,
      stopReason: reason,
      nextSendAt: undefined,
      ...touch(),
    });
  },
});

export const due = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const rows = alive(
      await ctx.db
        .query("sequences")
        .withIndex("by_next", (q) => q.eq("stopped", false).lte("nextSendAt", now))
        .collect(),
    );

    const out = [];
    for (const seq of rows.slice(0, limit ?? 5)) {
      const lead = await ctx.db.get(seq.leadId);
      if (!lead || lead.deletedAt !== undefined) continue;
      // Belt and braces: never follow up someone who has replied, even if the
      // sequence row somehow missed the stop.
      if (["replied", "interested", "not_now", "no", "call_booked", "won", "lost"].includes(lead.status)) {
        continue;
      }
      const previous = alive(
        await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", seq.leadId)).collect(),
      )
        .filter((e) => e.direction === "out" && e.status === "sent")
        .sort((a, b) => a.createdAt - b.createdAt);

      out.push({ ...seq, lead, previousBodies: previous.map((e) => e.body) });
    }
    return out;
  },
});

export const forLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) =>
    await ctx.db.query("sequences").withIndex("by_lead", (q) => q.eq("leadId", leadId)).unique(),
});
