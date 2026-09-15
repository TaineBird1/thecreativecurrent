/**
 * Seed. Idempotent — safe to re-run.
 *
 * One rule worth knowing: re-seeding NEVER overwrites a prompt you have edited
 * in the app. `promptEditedAt` being set means your edit wins, permanently,
 * over whatever is in packages/agents/<bot>/prompt.md. Everything else about a
 * bot (desk, tools, schedule) is refreshed from the registry so the file stays
 * the source of truth for structure.
 *
 * Run: pnpm seed
 */
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { stamps, touch, alive } from "./lib/soft";
import { ensureSettings } from "./lib/settings";
import { BOTS } from "../packages/agents/registry";
import { PROMPTS } from "../packages/agents/prompts.generated";
import { PRICING_YAML } from "./lib/pricingDefault";

async function seedAll(ctx: MutationCtx) {
  const report: string[] = [];

  // ── Settings ──────────────────────────────────────────────────────────
  const settings = await ensureSettings(ctx);
  const budgets: Record<string, number> = { ...(settings.budgets ?? {}) };
  for (const bot of BOTS) {
    if (budgets[bot.key] === undefined) budgets[bot.key] = bot.dailyBudget;
  }
  await ctx.db.patch(settings._id, {
    budgets,
    pricingYaml: settings.pricingYaml || PRICING_YAML,
    ...touch(),
  });
  report.push("settings ready");

  // ── The nine employees ────────────────────────────────────────────────
  let created = 0;
  let refreshed = 0;
  for (const def of BOTS) {
    const existing = await ctx.db
      .query("bots")
      .withIndex("by_key", (q) => q.eq("key", def.key))
      .unique();

    const fromRegistry = {
      name: def.name,
      role: def.role,
      department: def.department,
      blurb: def.blurb,
      avatar: def.avatar,
      desk: def.desk,
      tools: def.tools,
      scheduleCron: def.scheduleCron,
      scheduleLabel: def.scheduleLabel,
      dailyBudget: def.dailyBudget,
    };

    if (!existing) {
      await ctx.db.insert("bots", {
        key: def.key,
        ...fromRegistry,
        status: "idle" as const,
        currentTask: "Waiting for the day to start",
        systemPrompt: PROMPTS[def.key],
        toolsDisabled: [],
        scheduleEnabled: def.scheduleEnabled,
        ...stamps(),
      });
      created++;
    } else {
      // Structure follows the registry; the prompt follows your edits.
      await ctx.db.patch(existing._id, {
        ...fromRegistry,
        ...(existing.promptEditedAt ? {} : { systemPrompt: PROMPTS[def.key] }),
        ...touch(),
      });
      refreshed++;
    }
  }
  report.push(`bots: ${created} created, ${refreshed} refreshed`);

  // ── Sample data, so the office is alive on first run ───────────────────
  const existingLeads = alive(await ctx.db.query("leads").collect());
  if (existingLeads.length === 0) {
    const samples = [
      {
        businessName: "Ballito Roofing & Waterproofing",
        contactName: "Dean",
        tier: 1 as const,
        category: "roofing contractor",
        mobile: "+27824419087",
        landline: "032 946 1120",
        email: "info@ballitoroofing.co.za",
        emailStatus: "published" as const,
        facebookUrl: "https://www.facebook.com/ballitoroofingkzn",
        websiteUrl: "http://www.ballitoroofing.co.za",
        address: "12 Moffat Drive, Ballito",
        suburb: "Ballito",
        hasWebsite: true,
        faults: [
          {
            code: "not_mobile_responsive",
            detail: "The site doesn't resize on a phone — you have to pinch and scroll sideways to read it.",
            severity: "high" as const,
          },
          {
            code: "http_not_https",
            detail: "The site still loads over http, so Chrome shows a 'Not secure' warning next to the address.",
            severity: "high" as const,
          },
          {
            code: "slow_load",
            detail: "The homepage takes 8.4 seconds to load on a phone.",
            severity: "high" as const,
          },
          {
            code: "stale_copyright",
            detail: "The footer still says 2019.",
            severity: "low" as const,
          },
        ],
        loadSeconds: 8.4,
        facebookActivity: undefined,
        score: 82,
        status: "qualified" as const,
        source: "snupit",
        sourceUrl: "https://www.snupit.co.za/roofing/ballito",
        dedupeKey: "ballitoroofing.co.za",
        auditedAt: Date.now() - 6 * 60 * 60 * 1000,
      },
      {
        businessName: "Hillcrest Solar Solutions",
        contactName: "not_found",
        tier: 2 as const,
        category: "solar installer",
        mobile: "+27713305514",
        landline: "not_found",
        email: "quotes@hillcrestsolar.co.za",
        emailStatus: "inferred" as const,
        facebookUrl: "https://www.facebook.com/hillcrestsolarsolutions",
        websiteUrl: "not_found",
        address: "Old Main Road, Hillcrest",
        suburb: "Hillcrest",
        hasWebsite: false,
        faults: [],
        loadSeconds: undefined,
        facebookActivity:
          "Posts finished installs 2-3 times a week and takes every enquiry in the comments — no form, no website.",
        score: 74,
        status: "qualified" as const,
        source: "facebook_pages",
        sourceUrl: "https://www.facebook.com/hillcrestsolarsolutions",
        dedupeKey: "hillcrest solar solutions|hillcrest",
        auditedAt: Date.now() - 20 * 60 * 60 * 1000,
      },
      {
        businessName: "Umhlanga Guest Lodge",
        contactName: "Priya",
        tier: 3 as const,
        category: "guest house",
        mobile: "+27836614402",
        landline: "031 561 7788",
        email: "not_found",
        emailStatus: "not_found" as const,
        facebookUrl: "https://www.facebook.com/umhlangaguestlodge",
        websiteUrl: "https://www.umhlangaguestlodge.co.za",
        address: "8 Lagoon Drive, Umhlanga Rocks",
        suburb: "Umhlanga",
        hasWebsite: true,
        faults: [
          {
            code: "no_contact_form",
            detail: "There's no booking or enquiry form — the only way to reach you is an email address typed as text.",
            severity: "high" as const,
          },
          {
            code: "no_click_to_call",
            detail: "The phone number isn't tappable on a phone.",
            severity: "medium" as const,
          },
          {
            code: "no_gallery",
            detail: "There are four photos of the rooms and none of the pool or the breakfast area.",
            severity: "medium" as const,
          },
        ],
        loadSeconds: 3.1,
        facebookActivity: undefined,
        score: 61,
        status: "qualified" as const,
        source: "sa_venues",
        sourceUrl: "https://www.sa-venues.com/accommodation/umhlanga",
        dedupeKey: "umhlangaguestlodge.co.za",
        auditedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    ];

    for (const s of samples) {
      const id = await ctx.db.insert("leads", { ...s, lastTouchAt: undefined, ...stamps() });
      await ctx.db.insert("leadEvents", {
        leadId: id,
        type: "discovered",
        detail: `Found on ${s.source}. Scored ${s.score}, Tier ${s.tier}.`,
        botKey: "leadgen",
        ...stamps(),
      });
    }
    report.push(`leads: ${samples.length} sample rows`);
  } else {
    report.push(`leads: ${existingLeads.length} already present, left alone`);
  }

  // ── Repair: leads stranded by a rejection ─────────────────────────────
  //
  // Rejecting a draft used to leave its blocked email row behind, and
  // `leads.readyForOutreach` skips any lead that already has an outbound email.
  // So those leads sat on `qualified` — apparently live — while being invisible
  // to outreach forever. approvals.reject no longer does this, but leads
  // rejected before the fix are still stuck. Free them once.
  const rejectedOutreach = alive(
    await ctx.db.query("approvals").withIndex("by_status", (q) => q.eq("status", "rejected")).collect(),
  ).filter((a) => a.kind === "outreach_email" && a.leadId);

  let freed = 0;
  for (const leadId of new Set(rejectedOutreach.map((a) => a.leadId!))) {
    const lead = await ctx.db.get(leadId);
    // A lead deliberately discarded stays discarded — this only rescues the
    // ones still marked qualified, which is the contradictory state.
    if (!lead || lead.deletedAt || lead.status !== "qualified") continue;
    const stale = alive(
      await ctx.db.query("emails").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect(),
    ).filter((e) => e.direction === "out" && e.status === "blocked");
    if (stale.length === 0) continue;
    for (const draft of stale) {
      await ctx.db.patch(draft._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    }
    freed += 1;
  }
  if (freed > 0) {
    report.push(`leads: ${freed} freed for a rewrite (were stranded by a rejected draft)`);
  }

  // ── The client record ─────────────────────────────────────────────────
  //
  // This used to seed SMIT Kontrakteurs as a paying client on a R1,100/month
  // growth plan, with a contact name and mobile number. SMIT is a spec build —
  // nobody commissioned it and nobody pays for it, so every one of those fields
  // was invented, and the fee was being counted as real money in Thabo's MRR.
  //
  // Champagne Holidays is the one genuine client, so it takes the slot. What is
  // NOT filled in matters as much as what is:
  //
  //  - `email` stays "not_found" deliberately. Bongi can send a client email on
  //    his own once the guards pass (clientsuccess.ts), and a real address here
  //    means a bot may write to a real client unprompted. Put the address in
  //    when you want that, as a decision rather than a side effect of seeding.
  //  - `monthlyFee` is 0 and the tier is a placeholder because the real figures
  //    are not known here. A guessed fee is revenue reported to you that does
  //    not exist, which is worse than a gap you can see.
  const existingClients = alive(await ctx.db.query("clients").collect());

  // Retire the fabricated SMIT row if a previous seed created it. Soft delete,
  // per the house rule — narrowly matched so a real client of the same name
  // would never be touched.
  const seededSmit = existingClients.find(
    (c) => c.businessName === "SMIT Kontrakteurs" && c.siteUrl.includes("smitkontrakteurs.co.za"),
  );
  if (seededSmit) {
    await ctx.db.patch(seededSmit._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    // The sample change request hung off that client. Left alone it outlives the
    // client it belongs to and shows up on the board attached to nobody.
    const orphans = alive(await ctx.db.query("changeRequests").collect()).filter(
      (r) => r.clientId === seededSmit._id,
    );
    for (const orphan of orphans) {
      await ctx.db.patch(orphan._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    }
    report.push(
      `clients: retired the fabricated SMIT sample (spec build, never a client)` +
        (orphans.length ? ` and ${orphans.length} change request(s) attached to it` : ""),
    );
  }

  const remaining = existingClients.filter((c) => c._id !== seededSmit?._id);
  if (remaining.length === 0) {
    await ctx.db.insert("clients", {
      businessName: "Champagne Holidays",
      contactName: "not_found",
      email: "not_found",
      mobile: "not_found",
      siteUrl: "https://www.champagneholidays.com/",
      carePlanTier: "essential" as const,
      monthlyFee: 0,
      uptimePercent30d: 100,
      notes:
        "Ski travel website. The studio's one real client build. " +
        "Care plan and fee NOT recorded — tier is a placeholder and the fee is 0 " +
        "so it cannot inflate MRR; set both once agreed. " +
        "Email left unset on purpose so no bot can write to them unprompted.",
      ...stamps(),
    });
    report.push("clients: Champagne Holidays added (fee and email left unset on purpose)");
  } else {
    report.push(`clients: ${remaining.length} already present, left alone`);
  }

  return report;
}

/** `pnpm seed` runs this. */
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    const report = await seedAll(ctx);
    return report.join("\n");
  },
});

export const runInternal = internalMutation({
  args: {},
  handler: async (ctx) => (await seedAll(ctx)).join("\n"),
});
