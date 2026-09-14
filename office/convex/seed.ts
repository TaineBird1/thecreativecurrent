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

  // ── One sample client ─────────────────────────────────────────────────
  const existingClients = alive(await ctx.db.query("clients").collect());
  if (existingClients.length === 0) {
    const clientId = await ctx.db.insert("clients", {
      businessName: "SMIT Kontrakteurs",
      contactName: "Johan",
      email: "not_found",
      mobile: "+27824550193",
      siteUrl: "https://www.smitkontrakteurs.co.za",
      carePlanTier: "growth" as const,
      monthlyFee: 1100,
      renewalDate: new Date(Date.now() + 74 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      uptimePercent30d: 100,
      lastCheckAt: Date.now() - 45 * 60 * 1000,
      lastStatusCode: 200,
      notes: "Bilingual EN/AF. WhatsApp quote button. Reference this one for every trades prospect.",
      ...stamps(),
    });
    await ctx.db.insert("changeRequests", {
      clientId,
      description: "Add the three Terraforce retaining wall jobs from November to the gallery.",
      submittedBy: "Johan",
      status: "open" as const,
      costFlagged: false,
      ...stamps(),
    });
    report.push("clients: 1 sample row + 1 change request");
  } else {
    report.push(`clients: ${existingClients.length} already present, left alone`);
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
