import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { stamps, touch, alive, getAlive, softDelete } from "./lib/soft";
import { leadStatus } from "./schema";

/**
 * Leads.
 *
 * Two things here are load-bearing:
 *  - `dedupeKey` prevents the same business arriving twice from two directories.
 *    A discarded lead keeps its row precisely so it can be recognised and
 *    discarded again cheaply rather than re-researched every day.
 *  - Contact fields are never blank. The Lead-gen bot writes the literal string
 *    "not_found" instead, so "we looked and there isn't one" is distinguishable
 *    from "nobody has looked yet".
 */

export const list = query({
  args: {
    status: v.optional(leadStatus),
    tier: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, tier, search, limit }) => {
    let rows = alive(await ctx.db.query("leads").collect());
    if (status) rows = rows.filter((l) => l.status === status);
    if (tier) rows = rows.filter((l) => l.tier === tier);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.businessName.toLowerCase().includes(q) ||
          l.suburb.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q),
      );
    }
    return rows
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, limit ?? 200);
  },
});

export const byId = query({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const lead = await getAlive(ctx, id);
    if (!lead) return null;
    const events = alive(
      await ctx.db.query("leadEvents").withIndex("by_lead", (q) => q.eq("leadId", id)).collect(),
    ).sort((a, b) => b.createdAt - a.createdAt);
    const emails = alive(
      await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", id)).collect(),
    ).sort((a, b) => a.createdAt - b.createdAt);
    const sequence = await ctx.db
      .query("sequences")
      .withIndex("by_lead", (q) => q.eq("leadId", id))
      .unique();
    return { lead, events, emails, sequence };
  },
});

/** Has this business already been seen — including as a discard? */
export const findByDedupeKey = query({
  args: { dedupeKey: v.string() },
  handler: async (ctx, { dedupeKey }) =>
    await ctx.db.query("leads").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique(),
});

export const create = internalMutation({
  args: {
    businessName: v.string(),
    contactName: v.optional(v.string()),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(),
    mobile: v.string(),
    landline: v.string(),
    email: v.string(),
    emailStatus: v.union(v.literal("published"), v.literal("inferred"), v.literal("not_found")),
    facebookUrl: v.string(),
    websiteUrl: v.string(),
    address: v.string(),
    suburb: v.string(),
    hasWebsite: v.boolean(),
    faults: v.array(
      v.object({
        code: v.string(),
        detail: v.string(),
        severity: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      }),
    ),
    loadSeconds: v.optional(v.number()),
    facebookActivity: v.optional(v.string()),
    score: v.number(),
    status: leadStatus,
    discardReason: v.optional(v.string()),
    source: v.string(),
    sourceUrl: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    if (existing) return { id: existing._id, created: false };

    const id = await ctx.db.insert("leads", { ...args, ...stamps() });
    await ctx.db.insert("leadEvents", {
      leadId: id,
      type: args.status === "discarded" ? "discarded" : "discovered",
      detail:
        args.status === "discarded"
          ? `Discarded: ${args.discardReason ?? "no reason recorded"}`
          : `Found on ${args.source}. Tier ${args.tier}, scored ${args.score}.`,
      botKey: "leadgen",
      ...stamps(),
    });
    return { id, created: true };
  },
});

export const patchLead = internalMutation({
  args: {
    id: v.id("leads"),
    patch: v.any(),
    event: v.optional(v.object({ type: v.string(), detail: v.string(), botKey: v.string() })),
  },
  handler: async (ctx, { id, patch, event }) => {
    await ctx.db.patch(id, { ...patch, ...touch() });
    if (event) {
      await ctx.db.insert("leadEvents", { leadId: id, ...event, ...stamps() });
    }
  },
});

export const setStatus = mutation({
  args: { id: v.id("leads"), status: leadStatus, note: v.optional(v.string()) },
  handler: async (ctx, { id, status, note }) => {
    await ctx.db.patch(id, { status, ...touch() });
    await ctx.db.insert("leadEvents", {
      leadId: id,
      type: "status_changed",
      detail: `Moved to ${status}${note ? ` — ${note}` : ""} (by you).`,
      botKey: "boss",
      ...stamps(),
    });
  },
});

/** Soft delete. The row stays so the dedupe check still recognises it. */
export const archive = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    await softDelete(ctx, id);
  },
});

/** Ready for Outreach: qualified, contactable, not yet touched. */
export const readyForOutreach = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = alive(
      await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "qualified")).collect(),
    );
    return rows
      .filter((l) => l.email !== "not_found" && l.email.includes("@"))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit ?? 10);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("leads").collect());
    const by = (s: string) => rows.filter((l) => l.status === s).length;
    return {
      total: rows.length,
      qualified: by("qualified"),
      discarded: by("discarded"),
      contacted: by("contacted"),
      replied: by("replied"),
      interested: by("interested"),
      callBooked: by("call_booked"),
      won: by("won"),
    };
  },
});

export const recentEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    alive(await ctx.db.query("leadEvents").order("desc").take(limit ?? 40)),
});
