import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authedQuery, authedMutation } from "./lib/authed";
import { stamps, touch, alive, getAlive, softDelete } from "./lib/soft";
import { leadStatus } from "./schema";
import {
  isDirectoryHost,
  isSocialHost,
  isOwnWebsite,
  isDirectoryOwnedSocial,
} from "../packages/shared/tools/sources";

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

export const list = authedQuery({
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

export const byId = authedQuery({
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
export const findByDedupeKey = authedQuery({
  args: { dedupeKey: v.string() },
  handler: async (ctx, { dedupeKey }) =>
    await ctx.db.query("leads").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique(),
});

/**
 * Which of these listing URLs we have already processed.
 *
 * Called before a run spends its budget. A directory search returns the same
 * page of listings every morning, so without this the first few are fetched,
 * recognised as duplicates, counted against the run, and the ones further down
 * are never reached at all — a source can look like it is working while making
 * no progress whatsoever after its first run.
 *
 * Discarded leads count as known on purpose: they are exactly the ones we do
 * not want to pay to look at twice.
 */
export const knownSourceUrls = authedQuery({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    const known: string[] = [];
    for (const url of urls) {
      const hit = await ctx.db
        .query("leads")
        .withIndex("by_source_url", (q) => q.eq("sourceUrl", url))
        .first();
      if (hit) known.push(url);
    }
    return known;
  },
});

/**
 * Which of these businesses we already have, asked in one round trip.
 *
 * The worker hands back whole businesses off a rendered Maps page, and a
 * business we already know is recognised for free — name, suburb and website
 * are all in hand, no fetch and no model call. It was still costing a slot in
 * the run, which is how twelve slots produced three leads while fifty-odd
 * businesses waited behind them.
 */
export const knownDedupeKeys = authedQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, { keys }) => {
    const known: string[] = [];
    for (const key of [...new Set(keys)]) {
      const hit = await ctx.db
        .query("leads")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", key))
        .first();
      if (hit) known.push(key);
    }
    return known;
  },
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

export const setStatus = authedMutation({
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
export const archive = authedMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    await softDelete(ctx, id);
  },
});

/**
 * Ready for Outreach: qualified, contactable, and not already written to.
 *
 * "Not already written to" has to mean any outbound row, not just a sent one.
 * A draft held back by a guard or by sending being off still exists, and
 * without this check Lerato rewrote the same three leads every half hour all
 * day, paying for each one.
 *
 * Also excluded: `emailStatus: "inferred"`. Where nothing was published,
 * Lead-gen guesses `info@theirdomain.co.za` — a good guess for a small South
 * African trade, and still a guess. The comment above the guessing code has
 * always said "a bounced first impression is worse than no email at all", and
 * this query then sent to them anyway, which made that sentence decoration.
 *
 * Bounces are also what damages a new sending domain's reputation, and
 * office.thecreativecurrent.co.za has none yet to spend.
 *
 * So an inferred address waits for a human to look at it. Those leads stay
 * qualified and visible on the Leads screen; confirm or correct the address and
 * mark it published, and the lead joins the queue. Nothing is lost, it is just
 * not sent to on a guess.
 */
export const readyForOutreach = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = alive(
      await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "qualified")).collect(),
    ).filter(
      (l) => l.email !== "not_found" && l.email.includes("@") && l.emailStatus === "published",
    );

    const ready = [];
    for (const lead of rows.sort((a, b) => b.score - a.score)) {
      if (ready.length >= (limit ?? 10)) break;
      const written = alive(
        await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect(),
      ).some((e) => e.direction === "out");
      if (!written) ready.push(lead);
    }
    return ready;
  },
});

/**
 * Confirm or correct a guessed address, which lets the lead into the outreach
 * queue.
 *
 * The other half of holding inferred addresses back. Without this they would be
 * held back for ever — visible, qualified, and permanently unreachable — which
 * is worse than sending to the guess, because at least a guess sometimes lands.
 *
 * Marking it published is a person saying they looked. Nothing here verifies
 * anything, and nothing pretends to.
 */
export const confirmEmail = authedMutation({
  args: { id: v.id("leads"), email: v.string() },
  handler: async (ctx, { id, email }) => {
    const lead = await getAlive(ctx, id);
    if (!lead) throw new Error("That lead no longer exists.");

    const clean = email.trim().toLowerCase();
    if (!/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(clean)) {
      throw new Error(`"${email}" is not an email address.`);
    }

    const changed = clean !== lead.email;
    await ctx.db.patch(id, { email: clean, emailStatus: "published" as const, ...touch() });
    await ctx.db.insert("leadEvents", {
      leadId: id,
      type: "email_confirmed",
      detail: changed
        ? `Address corrected from the guess ${lead.email} to ${clean} (by you). Now in the outreach queue.`
        : `Guessed address ${clean} confirmed by you. Now in the outreach queue.`,
      botKey: "boss",
      ...stamps(),
    });
    return { ok: true, email: clean };
  },
});

/**
 * Record that a person looked and there is no address to find.
 *
 * The missing third answer. `confirmEmail` assumed the guess was either right
 * or correctable, and the Leads screen offered only those two buttons — so the
 * outcome someone actually reaches, "I opened their site and there is no email
 * anywhere", had nowhere to go. Six leads were checked by hand and every one of
 * them came back that way, and none of it could be written down: the badge
 * still said six, and the next person to look would have checked the same six
 * sites again.
 *
 * So this records the looking. The guess is cleared — keeping it would leave an
 * address on the row that nothing may ever use — and kept in the event log,
 * because "we guessed info@ and it was wrong" is worth knowing next time the
 * same domain turns up.
 *
 * What happens to the lead then depends on whether there is another way to
 * reach them. A phone number means it is a call rather than an email, and it
 * stays qualified and shows up on the call list. Nothing at all means it is
 * genuinely unreachable and is discarded, with the reason saying who decided
 * that and why — the row itself stays, so the dedupe check still knows the
 * business and Lead-gen will not spend another run rediscovering it.
 */
export const noEmailPublished = authedMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const lead = await getAlive(ctx, id);
    if (!lead) throw new Error("That lead no longer exists.");

    const guess = lead.email;
    const stillReachable =
      lead.mobile !== "not_found" ||
      lead.landline !== "not_found" ||
      lead.facebookUrl !== "not_found";

    await ctx.db.patch(id, {
      email: "not_found",
      emailStatus: "not_found" as const,
      ...(stillReachable
        ? {}
        : {
            status: "discarded" as const,
            discardReason:
              "You checked their site and there is no email published, and there is no phone " +
              "number or Facebook page either — no way to reach them at all.",
          }),
      ...touch(),
    });

    await ctx.db.insert("leadEvents", {
      leadId: id,
      type: "email_not_published",
      detail: stillReachable
        ? `You checked their site: no email published anywhere. The guess ${guess} was dropped. ` +
          `Still reachable by phone, so this one is a call rather than an email.`
        : `You checked their site: no email published anywhere. The guess ${guess} was dropped, ` +
          `and with no phone or Facebook page either there is no way to reach them — discarded.`,
      botKey: "boss",
      ...stamps(),
    });

    return { ok: true, discarded: !stillReachable };
  },
});

/**
 * Leads worth a phone call: qualified, no email we may use, but a number.
 *
 * Lerato only sends email, so without this these would be qualified leads that
 * quietly never get touched by anything — the same disappearing act the
 * held-back pile was doing, one step further along.
 */
export const callable = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "qualified")).collect())
      .filter(
        (l) =>
          l.emailStatus === "not_found" &&
          (l.mobile !== "not_found" || l.landline !== "not_found"),
      )
      .sort((a, b) => b.score - a.score),
});

/** The leads behind that count, for a re-check that has their own site to read. */
export const guessedAddresses = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "qualified")).collect())
      .filter((l) => l.emailStatus === "inferred" && l.websiteUrl !== "not_found")
      .sort((a, b) => b.score - a.score),
});

/** How many good leads are waiting on someone to check a guessed address. */
export const waitingOnAddress = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "qualified")).collect())
      .filter((l) => l.emailStatus === "inferred").length,
});

/**
 * How each source is actually performing, by whether its leads can be emailed.
 *
 * Twenty-four qualified leads turned out to have no email address at all, which
 * raises a question the lead rows cannot answer one at a time: is that what
 * small SA trade businesses are like, or is it what one directory is like? The
 * two have completely different fixes — the first is a call list, the second is
 * Sipho searching somewhere else — and guessing between them would mean
 * rebuilding the wrong half.
 *
 * `emailable` is the rate that matters: the share of a source's leads carrying
 * an address published on their own site, which is the only kind Outreach will
 * write to. A source with good coverage and a low emailable rate is costing a
 * run every morning and filling the pipeline with leads only a phone can reach.
 */
export const sourceHealth = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("leads").collect());

    const by = new Map<
      string,
      { source: string; total: number; published: number; inferred: number; none: number; withPhone: number; qualified: number; contacted: number }
    >();

    for (const lead of rows) {
      const key = lead.source || "unknown";
      const row =
        by.get(key) ??
        { source: key, total: 0, published: 0, inferred: 0, none: 0, withPhone: 0, qualified: 0, contacted: 0 };

      row.total += 1;
      if (lead.emailStatus === "published") row.published += 1;
      else if (lead.emailStatus === "inferred") row.inferred += 1;
      else row.none += 1;
      if (lead.mobile !== "not_found" || lead.landline !== "not_found") row.withPhone += 1;
      if (lead.status === "qualified") row.qualified += 1;
      if (lead.status === "contacted") row.contacted += 1;

      by.set(key, row);
    }

    return [...by.values()]
      .map((r) => ({ ...r, emailable: r.total === 0 ? 0 : Math.round((r.published / r.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  },
});

/**
 * Leads carrying a directory's own address instead of the business's.
 *
 * Until the filter in pickEmail existed, an email scraped off a listing page
 * could be the directory's own — a Snupit listing has Snupit's address in its
 * footer next to the plumber's — and it was stored as "published", which is the
 * one status Outreach will write to without asking anyone.
 *
 * The filter stops new ones. This finds any already on the list, because the
 * consequence is not a bad row in a table: it is an email about a plumber's
 * website, addressed to the directory that listed them, sent from a real
 * address of Taine's. Shows nothing once there are none, and then it is simply
 * a check that keeps passing.
 */
export const directoryAddresses = authedQuery({
  args: {},
  handler: async (ctx) =>
    alive(await ctx.db.query("leads").collect()).filter((l) => {
      const domain = l.email.includes("@") ? l.email.split("@")[1] : null;
      if (domain && (isDirectoryHost(domain) || isSocialHost(domain))) return true;
      // The cause behind most of those addresses, and worth showing on its own:
      // a lead whose "website" is a Facebook page. Everything measured about
      // that site was measured about Facebook, including the faults written for
      // Lerato to quote.
      if (l.hasWebsite && !isOwnWebsite(l.websiteUrl)) return true;
      // And the third field it went wrong in: the directory's own Facebook
      // page, taken off their listing and filed under the business.
      return isDirectoryOwnedSocial(l.facebookUrl);
    }),
});

/**
 * Repair the leads whose "website" was never theirs.
 *
 * Maps returns whatever the owner typed into the website box, and for a small
 * trade that is often a Facebook page or a WhatsApp catalogue. Lead-gen no
 * longer accepts those, but it does not go back and rewrite rows already in the
 * database — and those rows are wrong in a way that reads as authoritative:
 * Musawakhe Energy Solutions still shows five findings about "their site",
 * under a line saying Lerato can quote one straight into an email. Every one of
 * them was measured against wa.me.
 *
 * So: the site is recorded as what it is — not theirs — and the findings about
 * it go with it. Deleting the faults is deliberate and is the point. They are
 * not data about this business; keeping them would mean keeping a sentence
 * about Facebook filed under a plumber, waiting to be read out.
 *
 * What they had is not thrown away: the Facebook page moves to the Facebook
 * field where it belongs, and the event log records the whole exchange. A
 * business with no website is also a better lead than one with a bad website,
 * so nothing is lost by saying so.
 */
export const repairMisreadSites = authedMutation({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("leads").collect());
    let repaired = 0;

    for (const lead of rows) {
      const siteIsTheirs = !lead.hasWebsite || isOwnWebsite(lead.websiteUrl);
      const borrowedSocial = isDirectoryOwnedSocial(lead.facebookUrl);
      const borrowedEmail =
        lead.email.includes("@") &&
        (isDirectoryHost(lead.email.split("@")[1]) || isSocialHost(lead.email.split("@")[1]));
      if (siteIsTheirs && !borrowedSocial && !borrowedEmail) continue;

      const patch: Record<string, unknown> = {};
      const changed: string[] = [];

      if (!siteIsTheirs) {
        // A Facebook page in the website box is still a Facebook page.
        if (/facebook\.com/i.test(lead.websiteUrl) && !isDirectoryOwnedSocial(lead.websiteUrl)) {
          patch.facebookUrl = lead.websiteUrl;
          changed.push("their Facebook page moved to the Facebook field");
        } else if (borrowedSocial) {
          patch.facebookUrl = "not_found";
        }
        patch.websiteUrl = "not_found";
        patch.hasWebsite = false;
        patch.loadSeconds = undefined;
        if (lead.faults.length > 0) {
          patch.faults = [];
          changed.push(`${lead.faults.length} findings dropped — they were about ${lead.websiteUrl}, not about this business`);
        }
        changed.push("recorded as having no website");
      } else if (borrowedSocial) {
        patch.facebookUrl = "not_found";
        changed.push(`${lead.facebookUrl} belongs to the directory, not to them`);
      }

      if (borrowedEmail) {
        patch.email = "not_found";
        patch.emailStatus = "not_found";
        changed.push(`the address ${lead.email} was guessed from somebody else's domain`);
      }

      await ctx.db.patch(lead._id, { ...patch, ...touch() });
      await ctx.db.insert("leadEvents", {
        leadId: lead._id,
        type: "repaired",
        detail: `Corrected what was read off their listing: ${changed.join("; ")}.`,
        botKey: "boss",
        ...stamps(),
      });
      repaired++;
    }

    return { repaired };
  },
});

/** Drafts written but never sent — waiting on sending being switched on. */
export const draftedNotSent = authedQuery({
  args: {},
  handler: async (ctx) => {
    const rows = alive(
      await ctx.db.query("emails").withIndex("by_status", (q) => q.eq("status", "blocked")).collect(),
    );
    return rows.filter((e) => e.direction === "out" && e.leadId).length;
  },
});

export const counts = authedQuery({
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

export const recentEvents = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    alive(await ctx.db.query("leadEvents").order("desc").take(limit ?? 40)),
});
