import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, touch, alive } from "./lib/soft";
import { sastDay, DAY_MS } from "./lib/time";

/** Nightly rollup. Cheap to compute, and it makes the weekly report honest. */
export const snapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const day = sastDay();
    const since = Date.now() - DAY_MS;

    const [leads, emails, drafts, clients, approvals, llm] = await Promise.all([
      ctx.db.query("leads").collect(),
      ctx.db.query("emails").collect(),
      ctx.db.query("contentDrafts").collect(),
      ctx.db.query("clients").collect(),
      ctx.db.query("approvals").collect(),
      ctx.db.query("llmCalls").order("desc").take(2000),
    ]);

    const live = alive(leads);
    const liveEmails = alive(emails);

    const metrics = {
      date: day,
      period: "day" as const,
      leadsFound: live.filter((l) => l.createdAt > since && l.status !== "discarded").length,
      emailsSent: liveEmails.filter((e) => e.status === "sent" && e.createdAt > since).length,
      replies: liveEmails.filter((e) => e.direction === "in" && e.createdAt > since).length,
      callsBooked: live.filter((l) => l.status === "call_booked").length,
      proposalsOut: alive(approvals).filter((a) => a.kind === "proposal" && a.status === "approved").length,
      wins: live.filter((l) => l.status === "won").length,
      contentPublished: alive(drafts).filter((d) => d.status === "posted_by_boss").length,
      mrr: alive(clients).reduce((n, c) => n + c.monthlyFee, 0),
      llmCalls: alive(llm).filter((c) => c.createdAt > since).length,
    };

    const existing = await ctx.db
      .query("kpiSnapshots")
      .withIndex("by_date", (q) => q.eq("period", "day").eq("date", day))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...metrics, ...touch() });
      return existing._id;
    }
    return await ctx.db.insert("kpiSnapshots", { ...metrics, ...stamps() });
  },
});

/** The header numbers. One subscription, live. */
export const headline = authedQuery({
  args: {},
  handler: async (ctx) => {
    const [leads, emails, clients, approvals, escalations] = await Promise.all([
      ctx.db.query("leads").collect(),
      ctx.db.query("emails").collect(),
      ctx.db.query("clients").collect(),
      ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
      ctx.db.query("escalations").withIndex("by_status", (q) => q.eq("status", "open")).collect(),
    ]);

    const live = alive(leads);
    const liveEmails = alive(emails);
    const today = sastDay();

    return {
      leads: live.filter((l) => l.status !== "discarded").length,
      qualified: live.filter((l) => l.status === "qualified").length,
      sentToday: liveEmails.filter(
        (e) => e.status === "sent" && e.sentAt && sastDay(e.sentAt) === today && e.leadId,
      ).length,
      sentTotal: liveEmails.filter((e) => e.status === "sent").length,
      replies: liveEmails.filter((e) => e.direction === "in").length,
      booked: live.filter((l) => l.status === "call_booked").length,
      proposalsOut: alive(approvals).filter((a) => a.kind === "proposal").length,
      mrr: alive(clients).reduce((n, c) => n + c.monthlyFee, 0),
      approvals: alive(approvals).length,
      escalations: alive(escalations).length,
    };
  },
});

export const history = authedQuery({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) =>
    alive(await ctx.db.query("kpiSnapshots").order("desc").take(days ?? 30)).reverse(),
});
