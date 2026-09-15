import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authedQuery, authedMutation } from "./lib/authed";
import { stamps, touch, alive } from "./lib/soft";

/**
 * The queue the local Playwright worker leases from.
 *
 * Convex actions have no browser and a time ceiling, so anything needing a real
 * page render — screenshots, Google Maps, Facebook — runs on Taine's own PC via
 * `pnpm worker`. Free and unlimited, at the cost of only working while the
 * machine is on, which the office UI shows plainly.
 */

const LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;

export const enqueue = internalMutation({
  args: {
    type: v.union(v.literal("audit_site"), v.literal("directory"), v.literal("facebook_page")),
    payload: v.any(),
    priority: v.optional(v.number()),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    // Don't queue the same URL twice while one is still outstanding.
    const open = alive(
      await ctx.db.query("scrapeJobs").withIndex("by_status", (q) => q.eq("status", "queued")).collect(),
    );
    const url = args.payload?.url;
    if (url && open.some((j) => j.payload?.url === url)) return null;

    return await ctx.db.insert("scrapeJobs", {
      ...args,
      priority: args.priority ?? 3,
      status: "queued" as const,
      attempts: 0,
      ...stamps(),
    });
  },
});

/** The worker calls this. Takes the highest-priority queued job, or reclaims a stale lease. */
export const lease = authedMutation({
  args: { workerId: v.string(), max: v.optional(v.number()) },
  handler: async (ctx, { workerId, max }) => {
    const now = Date.now();

    // A worker that died mid-job should not park work forever.
    const leased = alive(
      await ctx.db.query("scrapeJobs").withIndex("by_status", (q) => q.eq("status", "leased")).collect(),
    );
    for (const job of leased) {
      if (now - (job.leasedAt ?? 0) > LEASE_MS) {
        await ctx.db.patch(job._id, {
          status: job.attempts >= MAX_ATTEMPTS ? ("failed" as const) : ("queued" as const),
          error: job.attempts >= MAX_ATTEMPTS ? "Gave up after 3 attempts." : undefined,
          ...touch(),
        });
      }
    }

    const queued = alive(
      await ctx.db.query("scrapeJobs").withIndex("by_status", (q) => q.eq("status", "queued")).collect(),
    ).sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    const taking = queued.slice(0, max ?? 3);
    for (const job of taking) {
      await ctx.db.patch(job._id, {
        status: "leased" as const,
        leasedAt: now,
        leasedBy: workerId,
        attempts: job.attempts + 1,
        ...touch(),
      });
    }
    return taking.map((j) => ({ id: j._id, type: j.type, payload: j.payload, leadId: j.leadId }));
  },
});

export const complete = authedMutation({
  args: { id: v.id("scrapeJobs"), result: v.any() },
  handler: async (ctx, { id, result }) => {
    await ctx.db.patch(id, { status: "done" as const, result, ...touch() });

    // A site audit comes back with the things only a real browser can see.
    const job = await ctx.db.get(id);
    if (job?.type === "audit_site" && job.leadId && result) {
      const patch: Record<string, unknown> = { auditedAt: Date.now(), ...touch() };
      if (result.screenshotDesktop) patch.screenshotDesktop = result.screenshotDesktop;
      if (result.screenshotMobile) patch.screenshotMobile = result.screenshotMobile;
      if (typeof result.seconds === "number") patch.loadSeconds = result.seconds;
      if (Array.isArray(result.faults) && result.faults.length > 0) patch.faults = result.faults;
      await ctx.db.patch(job.leadId, patch as never);
      await ctx.db.insert("leadEvents", {
        leadId: job.leadId,
        type: "audited",
        detail: `Screenshots taken and ${(result.faults ?? []).length} fault(s) confirmed in a real browser.`,
        botKey: "leadgen",
        ...stamps(),
      });
    }
  },
});

export const fail = authedMutation({
  args: { id: v.id("scrapeJobs"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const job = await ctx.db.get(id);
    if (!job) return;
    await ctx.db.patch(id, {
      status: job.attempts >= MAX_ATTEMPTS ? ("failed" as const) : ("queued" as const),
      error,
      ...touch(),
    });
  },
});

export const completedResults = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = alive(
      await ctx.db.query("scrapeJobs").withIndex("by_status", (q) => q.eq("status", "done")).collect(),
    );
    const cutoff = Date.now() - 26 * 60 * 60_000;
    return rows
      .filter((j) => j.consumedAt === undefined && j.updatedAt > cutoff)
      .slice(0, limit ?? 20);
  },
});

/**
 * Record how much of each job has been worked.
 *
 * Counted rather than flagged because one Google Maps search can return 26
 * businesses and a single run only works through a dozen — marking the whole
 * job done would quietly bin the rest. A job is finished only when its results
 * are.
 */
export const recordConsumption = internalMutation({
  args: { progress: v.array(v.object({ id: v.id("scrapeJobs"), consumed: v.number() })) },
  handler: async (ctx, { progress }) => {
    for (const { id, consumed } of progress) {
      const job = await ctx.db.get(id);
      if (!job) continue;
      const total =
        (job.result?.businesses?.length ?? 0) + (job.result?.urls?.length ?? 0);
      await ctx.db.patch(id, {
        consumedCount: consumed,
        ...(consumed >= total ? { consumedAt: Date.now() } : {}),
        ...touch(),
      });
    }
  },
});

export const queueDepth = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("scrapeJobs").collect());
    return {
      queued: rows.filter((j) => j.status === "queued").length,
      leased: rows.filter((j) => j.status === "leased").length,
      failed: rows.filter((j) => j.status === "failed").length,
    };
  },
});

/** Convex file storage for the worker's screenshots — free tier, no S3 bill. */
export const uploadUrl = authedMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});
