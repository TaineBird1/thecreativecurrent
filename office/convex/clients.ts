import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { stamps, touch, alive, getAlive } from "./lib/soft";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const clients = alive(await ctx.db.query("clients").collect());
    return await Promise.all(
      clients.map(async (c) => {
        const open = alive(
          await ctx.db
            .query("changeRequests")
            .withIndex("by_client", (q) => q.eq("clientId", c._id))
            .collect(),
        ).filter((r) => r.status !== "done").length;
        return { ...c, openRequests: open };
      }),
    );
  },
});

export const byId = query({
  args: { id: v.id("clients") },
  handler: async (ctx, { id }) => {
    const client = await getAlive(ctx, id);
    if (!client) return null;
    const requests = alive(
      await ctx.db.query("changeRequests").withIndex("by_client", (q) => q.eq("clientId", id)).collect(),
    );
    const checks = alive(
      await ctx.db
        .query("uptimeChecks")
        .withIndex("by_client", (q) => q.eq("clientId", id))
        .order("desc")
        .take(60),
    );
    return { client, requests, checks };
  },
});

export const create = mutation({
  args: {
    businessName: v.string(),
    contactName: v.string(),
    email: v.string(),
    mobile: v.string(),
    siteUrl: v.string(),
    carePlanTier: v.union(v.literal("essential"), v.literal("growth"), v.literal("priority")),
    monthlyFee: v.number(),
    renewalDate: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("clients", {
      ...args,
      uptimePercent30d: 100,
      ...stamps(),
    }),
});

export const recordCheck = internalMutation({
  args: {
    clientId: v.id("clients"),
    ok: v.boolean(),
    statusCode: v.optional(v.number()),
    responseMs: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("uptimeChecks", { ...args, ...stamps() });

    const recent = alive(
      await ctx.db
        .query("uptimeChecks")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .order("desc")
        .take(180),
    );
    const cutoff = Date.now() - 30 * 24 * 60 * 60_000;
    const window = recent.filter((c) => c.createdAt > cutoff);
    const percent = window.length
      ? Math.round((window.filter((c) => c.ok).length / window.length) * 1000) / 10
      : 100;

    await ctx.db.patch(args.clientId, {
      uptimePercent30d: percent,
      lastCheckAt: Date.now(),
      lastStatusCode: args.statusCode,
      ...(args.ok ? {} : { lastDownAt: Date.now() }),
      ...touch(),
    });

    // Two consecutive failures is an outage. One is noise — a flaky wifi
    // moment on the host should not wake anybody up.
    const lastTwo = recent.slice(0, 2);
    return {
      outage: !args.ok && lastTwo.length >= 1 && lastTwo.every((c) => !c.ok),
      percent,
    };
  },
});

export const changeRequests = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("changeRequests").collect());
    const clients = new Map(alive(await ctx.db.query("clients").collect()).map((c) => [c._id, c]));
    return rows
      .map((r) => ({ ...r, businessName: clients.get(r.clientId)?.businessName ?? "Unknown" }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** The client intake form writes here. Public on purpose — clients are not users. */
export const submitChangeRequest = mutation({
  args: { clientId: v.id("clients"), description: v.string(), submittedBy: v.string() },
  handler: async (ctx, args) =>
    await ctx.db.insert("changeRequests", {
      ...args,
      status: "open" as const,
      costFlagged: false,
      ...stamps(),
    }),
});

export const setRequestStatus = mutation({
  args: {
    id: v.id("changeRequests"),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("done"),
      v.literal("needs_approval"),
    ),
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status, ...touch() });
  },
});

export const flagRequestCost = internalMutation({
  args: { id: v.id("changeRequests"), approvalId: v.optional(v.id("approvals")) },
  handler: async (ctx, { id, approvalId }) => {
    await ctx.db.patch(id, {
      costFlagged: true,
      status: "needs_approval" as const,
      approvalId,
      ...touch(),
    });
  },
});

export const untriagedRequests = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(
      await ctx.db.query("changeRequests").withIndex("by_status", (q) => q.eq("status", "open")).collect(),
    );
    // The business name is joined in because the Approvals card this feeds
    // says "Ballito Roofing asked for X", not "a client asked for X".
    const clients = new Map(alive(await ctx.db.query("clients").collect()).map((c) => [c._id, c]));
    return rows.map((r) => ({
      ...r,
      businessName: clients.get(r.clientId)?.businessName ?? "A client",
    }));
  },
});
