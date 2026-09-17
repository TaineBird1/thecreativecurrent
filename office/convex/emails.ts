import { v } from "convex/values";
import { hasOrphanTokens } from "../packages/shared/guards/pii";
import { internalMutation, query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { stamps, alive, touch } from "./lib/soft";
import { sastDay } from "./lib/time";

/** Written only by convex/outbound.ts. Every send and every block lands here. */
export const record = internalMutation({
  args: {
    botKey: v.string(),
    direction: v.union(v.literal("out"), v.literal("in")),
    to: v.string(),
    from: v.string(),
    subject: v.string(),
    body: v.string(),
    bodySkeleton: v.optional(v.string()),
    leadId: v.optional(v.id("leads")),
    clientId: v.optional(v.id("clients")),
    sequenceStep: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("received"),
      v.literal("blocked"),
    ),
    providerId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    classification: v.optional(
      v.union(
        v.literal("interested"),
        v.literal("not_now"),
        v.literal("no"),
        v.literal("question"),
        v.literal("auto_reply"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("emails", { ...args, ...stamps() });
    if (args.leadId && args.status === "sent") {
      await ctx.db.patch(args.leadId, { lastTouchAt: Date.now(), ...touch() });
      await ctx.db.insert("leadEvents", {
        leadId: args.leadId,
        type: "emailed",
        detail: `Sent "${args.subject}"${args.sequenceStep ? ` (${args.sequenceStep}/3)` : ""}.`,
        botKey: args.botKey,
        ...stamps(),
      });
    }
    return id;
  },
});

/** Counts only real sends against the cap — blocked and failed do not count. */
export const sentTodayCount = authedQuery({
  args: {},
  handler: async (ctx) => {
    const day = sastDay();
    const rows = alive(
      await ctx.db.query("emails").withIndex("by_status", (q) => q.eq("status", "sent")).collect(),
    );
    const count = rows.filter(
      (e) => e.direction === "out" && e.sentAt && sastDay(e.sentAt) === day && e.leadId,
    ).length;
    return { day, count };
  },
});

export const recentSkeletons = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = alive(await ctx.db.query("emails").order("desc").take((limit ?? 50) * 3));
    return rows
      .filter((e) => e.direction === "out" && e.status === "sent" && e.bodySkeleton)
      .slice(0, limit ?? 50)
      .map((e) => e.bodySkeleton!);
  },
});

export const forLead = authedQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const rows = alive(
      await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
    );
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const recent = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    alive(await ctx.db.query("emails").order("desc").take(limit ?? 100)),
});

export const classify = internalMutation({
  args: {
    id: v.id("emails"),
    classification: v.union(
      v.literal("interested"),
      v.literal("not_now"),
      v.literal("no"),
      v.literal("question"),
      v.literal("auto_reply"),
    ),
  },
  handler: async (ctx, { id, classification }) => {
    await ctx.db.patch(id, { classification, ...touch() });
  },
});

/**
 * Sent emails that carry wording since found to be wrong.
 *
 * Twenty-one cold emails went out before three fixes landed on the same day,
 * and "which ones" is not answerable by reading a list of names — the bodies
 * are all stored, so it is answerable by reading the bodies.
 *
 * Each check is something a recipient can see, not a style preference:
 *
 *  - a placeholder token instead of the proof link, so the one paragraph meant
 *    to be clicked reads "<URL_1>";
 *  - a claim that SMIT Kontrakteurs is a client, which they are not — the
 *    easiest sentence in the email for a prospect to check, by phoning them;
 *  - a link to smitkontrakteurs.co.za, which is not a site that exists;
 *  - a full stop welded onto the end of a link, which some clients pull into
 *    the URL and break.
 *
 * Read-only, and deliberately says nothing about what to do. Whether any of
 * these deserves a correction is a judgement about a real person's inbox.
 */
export const sentWithOldWording = authedQuery({
  args: {},
  handler: async (ctx) => {
    const sent = alive(
      await ctx.db.query("emails").withIndex("by_status", (q) => q.eq("status", "sent")).collect(),
    ).filter((e) => e.direction === "out");

    const findings = [];
    for (const email of sent) {
      const problems: string[] = [];
      const body = email.body ?? "";

      if (hasOrphanTokens(body) || hasOrphanTokens(email.subject)) {
        problems.push("Placeholder token instead of the proof link");
      }
      // "built X for a contractor", "our client", "we work with" — the claim,
      // not merely the name.
      if (/\bbuilt\s+\S*smitkontrakteurs\S*\s+for\b/i.test(body) || /for a contractor in George/i.test(body)) {
        problems.push("Says SMIT is a client — they are a spec build");
      }
      if (/\bsmitkontrakteurs\.co\.za/i.test(body)) {
        problems.push("Links smitkontrakteurs.co.za, which does not resolve");
      }
      if (/https?:\/\/[^\s<>"']*\.{2,}(?=\s|$)|https?:\/\/[^\s<>"']*\/\.{1,2}(?=\s|$)/.test(body)) {
        problems.push("Trailing dots on the link");
      }

      if (problems.length === 0) continue;

      const lead = email.leadId ? await ctx.db.get(email.leadId) : null;
      findings.push({
        id: email._id,
        businessName: lead?.businessName ?? "(no lead attached)",
        to: email.to,
        subject: email.subject,
        sentAt: email.sentAt ?? email.createdAt,
        problems,
        body,
      });
    }

    return {
      checked: sent.length,
      findings: findings.sort((a, b) => a.sentAt - b.sentAt),
    };
  },
});
