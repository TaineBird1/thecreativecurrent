import { v } from "convex/values";
import { mutation, query, internalMutation, action } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { stamps, touch, alive, getAlive } from "./lib/soft";

/**
 * The Approvals inbox — the single place anything with real-world consequences
 * stops and waits for Taine.
 *
 * Nothing in here acts on its own. `approve` records the decision and then
 * hands the payload to whichever bot knows how to execute it; rejecting simply
 * closes the row. An approval that is never looked at results in nothing
 * happening, which is the correct failure mode.
 */

export const pending = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(
      await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const pendingCount = query({
  args: {},
  handler: async (ctx) =>
    alive(
      await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
    ).length,
});

export const history = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = alive(await ctx.db.query("approvals").order("desc").take(limit ?? 100));
    return rows.filter((r) => r.status !== "pending");
  },
});

export const byId = query({
  args: { id: v.id("approvals") },
  handler: async (ctx, { id }) => await getAlive(ctx, id),
});

/** Bots create these. Never called from the UI. */
export const create = internalMutation({
  args: {
    kind: v.string(),
    botKey: v.string(),
    title: v.string(),
    body: v.string(),
    reason: v.string(),
    guard: v.union(v.literal("money"), v.literal("claims"), v.literal("policy"), v.literal("manual")),
    matches: v.array(v.string()),
    payload: v.optional(v.any()),
    leadId: v.optional(v.id("leads")),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("approvals", { ...args, status: "pending", ...stamps() });

    // The bot that produced it is now waiting on the boss, and its desk says so.
    const bot = await ctx.db
      .query("bots")
      .withIndex("by_key", (q) => q.eq("key", args.botKey))
      .unique();
    if (bot && bot.status !== "off_shift") {
      await ctx.db.patch(bot._id, {
        status: "waiting_on_boss",
        currentTask: "Waiting on your approval",
        ...touch(),
      });
    }
    return id;
  },
});

/**
 * Approve, optionally with an edit. The edited text is what gets used — that is
 * the point of being able to edit here rather than sending it back.
 */
export const approve = mutation({
  args: { id: v.id("approvals"), editedBody: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { id, editedBody, note }) => {
    const row = await getAlive(ctx, id);
    if (!row) throw new Error("That approval no longer exists.");
    if (row.status !== "pending") throw new Error(`Already ${row.status}.`);

    await ctx.db.patch(id, {
      status: "approved",
      editedBody,
      note,
      decidedAt: Date.now(),
      ...touch(),
    });
    await clearWaitingIfDone(ctx, row.botKey);
    return { ok: true, kind: row.kind };
  },
});

/**
 * Reject an approval.
 *
 * "Reject" was doing two different jobs and only ever performing the
 * destructive one. The draft row it refused stayed in `emails`, and
 * `leads.readyForOutreach` skips any lead that already has an outbound email —
 * so rejecting a badly worded draft silently removed that lead from outreach
 * permanently, while leaving its status on `qualified` as though it were still
 * live. Three rejections in a row emptied the queue and the only visible
 * symptom was Lerato reporting "nothing to send".
 *
 * So the two meanings are now separate, and the default is the recoverable one:
 *
 *  - `dropLead: false` (default) — "not this draft". The refused draft is
 *    soft-deleted, the lead returns to the queue, and the note is handed to the
 *    next attempt so the same mistake is not made twice.
 *  - `dropLead: true` — "do not contact these people". The lead is discarded
 *    with the note as the reason and the sequence stopped.
 *
 * Either way the approval row keeps the full history; nothing is destroyed.
 */
export const reject = mutation({
  args: {
    id: v.id("approvals"),
    note: v.optional(v.string()),
    dropLead: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, note, dropLead }) => {
    const row = await getAlive(ctx, id);
    if (!row) throw new Error("That approval no longer exists.");
    if (row.status !== "pending") throw new Error(`Already ${row.status}.`);
    await ctx.db.patch(id, { status: "rejected", note, decidedAt: Date.now(), ...touch() });

    let outcome = "Rejected.";

    if (row.leadId && row.kind === "outreach_email") {
      const leadId = row.leadId;

      // The refused draft was never sent. Left in place it blocks the lead from
      // ever being drafted for again.
      const drafts = alive(
        await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
      ).filter((e) => e.direction === "out" && e.status === "blocked");
      for (const draft of drafts) {
        await ctx.db.patch(draft._id, { deletedAt: Date.now(), ...touch() });
      }

      const seq = await ctx.db
        .query("sequences")
        .withIndex("by_lead", (q) => q.eq("leadId", leadId))
        .unique();

      if (dropLead) {
        // Stop the sequence: sending the next one in three days would ignore
        // the decision that was just made.
        if (seq && !seq.stopped) {
          await ctx.db.patch(seq._id, {
            stopped: true,
            stopReason: "boss_rejected",
            nextSendAt: undefined,
            ...touch(),
          });
        }
        const lead = await getAlive(ctx, leadId);
        if (lead && lead.status !== "discarded") {
          await ctx.db.patch(leadId, {
            status: "discarded" as const,
            discardReason: note?.trim() || "Dropped from the Approvals inbox.",
            ...touch(),
          });
        }
        outcome = "Rejected — lead dropped, no further contact.";
      } else {
        // `sequences.start` resets a stopped row on the next draft, so leaving
        // this one stopped is safe and keeps follow-ups from firing meanwhile.
        if (seq && !seq.stopped) {
          await ctx.db.patch(seq._id, {
            stopped: true,
            stopReason: "boss_rejected",
            nextSendAt: undefined,
            ...touch(),
          });
        }
        outcome = "Draft rejected — the lead goes back in the queue for a rewrite.";
      }
    }

    await clearWaitingIfDone(ctx, row.botKey);
    return { ok: true, detail: outcome };
  },
});

/**
 * Notes from drafts previously rejected for a lead, newest first.
 *
 * Handed to the next draft attempt. Without it the same objection produces the
 * same email, the boss rejects it again, and the loop is invisible.
 */
export const rejectionNotesForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const rows = alive(
      await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "rejected")).collect(),
    ).filter((a) => a.leadId === leadId && a.kind === "outreach_email" && a.note?.trim());
    return rows
      .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt))
      .slice(0, 3)
      .map((a) => a.note!.trim());
  },
});

/** A bot stops "waiting on boss" only once nothing of its own is still pending. */
async function clearWaitingIfDone(ctx: MutationCtx, botKey: string) {
  const stillPending = alive(
    await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
  ).filter((a) => a.botKey === botKey);
  if (stillPending.length > 0) return;
  const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", botKey)).unique();
  if (bot && bot.status === "waiting_on_boss") {
    await ctx.db.patch(bot._id, { status: "idle", currentTask: "Back to it", ...touch() });
  }
}

/**
 * Approving is a decision; executing is a side effect. They are separate on
 * purpose — the mutation records the decision atomically and this action does
 * the work afterwards, so a failure to send can never lose the approval.
 */
export const approveAndExecute = action({
  args: { id: v.id("approvals"), editedBody: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ executed: boolean; detail: string }> => {
    const result = await ctx.runMutation(api.approvals.approve, args);

    if (result.kind === "outreach_email") {
      try {
        const detail: string = await ctx.runAction(internal.outbound.sendApproved, { approvalId: args.id });
        return { executed: true, detail };
      } catch (err) {
        return { executed: false, detail: err instanceof Error ? err.message : String(err) };
      }
    }
    // Proposals, contracts, ad-spend suggestions and content are approved into
    // the Library for Taine to use. Nothing about them is automatable — signing
    // a contract and placing an ad are his to do.
    return { executed: false, detail: "Approved. It's in the Library — nothing was sent." };
  },
});
