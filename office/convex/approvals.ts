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

export const reject = mutation({
  args: { id: v.id("approvals"), note: v.optional(v.string()) },
  handler: async (ctx, { id, note }) => {
    const row = await getAlive(ctx, id);
    if (!row) throw new Error("That approval no longer exists.");
    if (row.status !== "pending") throw new Error(`Already ${row.status}.`);
    await ctx.db.patch(id, { status: "rejected", note, decidedAt: Date.now(), ...touch() });

    // A rejected outreach email kills the sequence for that lead. Sending the
    // next one in three days would ignore the decision that was just made.
    if (row.leadId && row.kind === "outreach_email") {
      const seq = await ctx.db
        .query("sequences")
        .withIndex("by_lead", (q) => q.eq("leadId", row.leadId!))
        .unique();
      if (seq && !seq.stopped) {
        await ctx.db.patch(seq._id, {
          stopped: true,
          stopReason: "boss_rejected",
          nextSendAt: undefined,
          ...touch(),
        });
      }
    }
    await clearWaitingIfDone(ctx, row.botKey);
    return { ok: true };
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
