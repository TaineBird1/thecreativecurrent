"use node";
/**
 * Kagiso — SEO / Ads.
 *
 * Free sources only. Two things to know:
 *
 *  - Google's autocomplete endpoint is public and unkeyed. It gives real
 *    suggestions but NOT search volume. There is no free volume source, so this
 *    bot never reports one — an invented volume figure would drive real
 *    decisions about what to build.
 *  - Search Console and Google Ads report "not connected" until an OAuth
 *    connection exists. Taine confirmed Search Console is verified for the
 *    domain, so the connection point is wired and waiting for his credentials
 *    rather than stubbed out entirely.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { gateAll } from "../../packages/shared/guards";
import { fetchPage, stripTags, title as pageTitle, metaContent, headings, images, links } from "../../packages/shared/tools/html";

const OUR_SITE = "https://www.thecreativecurrent.co.za/";

/** Google's public autocomplete. No key, no quota to speak of, real suggestions. */
async function autocomplete(term: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=za&q=${encodeURIComponent(term)}`,
      { headers: { "user-agent": "TheCreativeCurrentOffice/1.0" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "seo", trigger: trigger ?? "cron", bubble: "Keyword research" },
      async (handle) => {
        const seeds = [
          "web design durban",
          "website for builders south africa",
          "solar installer website",
          "guest house website direct booking",
          "website for contractors kzn",
        ];

        const suggestions = new Set<string>();
        for (const seed of seeds) {
          if (await handle.stopped()) return "Stopped mid-run.";
          for (const s of await autocomplete(seed)) suggestions.add(s);
          // Broaden with the alphabet trick, but only two letters — this is a
          // free public endpoint and hammering it is how it stops being free.
          for (const letter of ["a", "h"]) {
            for (const s of await autocomplete(`${seed} ${letter}`)) suggestions.add(s);
          }
        }

        if (suggestions.size === 0) {
          return "Google's autocomplete endpoint returned nothing — it may be rate limiting us. Nothing written.";
        }

        await handle.say(`Clustering ${suggestions.size} keywords`);
        const { text } = await think(ctx, {
          botKey: "seo",
          purpose: "keyword_research",
          runId: handle.runId,
          user: [
            `${suggestions.size} real autocomplete suggestions, scraped just now:`,
            [...suggestions].join("\n"),
            "",
            "Cluster them by intent. You have NO volume data — do not estimate any. Say which are realistically worth targeting for a small Durban studio and why.",
            "Return the keyword research JSON from your instructions.",
          ].join("\n"),
          maxOutputTokens: 2000,
        });

        const parsed = parseJson<{
          clusters?: { theme: string; intent: string; keywords: string[]; worthTargeting: boolean; why: string }[];
        }>(text);
        const clusters = parsed.clusters ?? [];

        const body = [
          `# Keyword research — ${new Date().toISOString().slice(0, 10)}`,
          "",
          `${suggestions.size} suggestions from Google autocomplete. No volume data exists on the free tier, so none is given — these are intent clusters, not a traffic forecast.`,
          "",
          ...clusters.flatMap((c) => [
            `## ${c.theme} (${c.intent})${c.worthTargeting ? "" : " — not worth it"}`,
            c.why,
            ...c.keywords.map((k) => `- ${k}`),
            "",
          ]),
        ].join("\n");

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "seo",
          kind: "blog",
          title: `Keyword research — ${new Date().toISOString().slice(0, 10)}`,
          body,
          tags: ["seo", "keywords", "research"],
        });

        await handle.say("Auditing our own site");
        const audit = await auditOwnSite(ctx, handle.runId);

        return `${clusters.length} keyword cluster${clusters.length === 1 ? "" : "s"} from ${suggestions.size} suggestions. ${audit}`;
      },
    );
    return outcome.summary;
  },
});

async function auditOwnSite(ctx: Parameters<typeof withRun>[0], runId: string): Promise<string> {
  const page = await fetchPage(OUR_SITE);
  if (!page.html) return `Couldn't reach ${OUR_SITE} to audit it.`;

  // Measured, not guessed — the model gets facts and writes the fixes.
  const hs = headings(page.html);
  const imgs = images(page.html);
  const facts = [
    `URL: ${page.finalUrl} (${page.status}, ${page.seconds.toFixed(1)}s)`,
    `Title: "${pageTitle(page.html)}" (${pageTitle(page.html).length} chars)`,
    `Meta description: "${metaContent(page.html, "description")}" (${metaContent(page.html, "description").length} chars)`,
    `H1s: ${hs.filter((h) => h.level === 1).length}. Heading outline: ${hs.slice(0, 12).map((h) => `h${h.level}:${h.text.slice(0, 40)}`).join(" | ")}`,
    `Images: ${imgs.length}, missing alt text: ${imgs.filter((i) => !i.alt).length}`,
    `Internal links: ${links(page.html, page.finalUrl).filter((l) => l.includes("thecreativecurrent")).length}`,
    `Viewport meta: ${metaContent(page.html, "viewport") ? "present" : "MISSING"}`,
    `Word count: ${stripTags(page.html).split(/\s+/).length}`,
    `JSON-LD schema: ${/application\/ld\+json/.test(page.html) ? "present" : "missing"}`,
  ].join("\n");

  const { text } = await think(ctx, {
    botKey: "seo",
    purpose: "audit_onpage",
    runId,
    user: `On-page facts measured from our own homepage just now:\n\n${facts}\n\nOne concrete fix per finding. Return the audit JSON from your instructions.`,
    maxOutputTokens: 1600,
  });

  const parsed = parseJson<{ findings?: { area: string; issue: string; fix: string; severity: string }[] }>(text);
  const findings = parsed.findings ?? [];

  await ctx.runMutation(internal.library.saveDraft, {
    botKey: "seo",
    kind: "blog",
    title: `On-page audit — thecreativecurrent.co.za`,
    body: [
      "# On-page audit",
      "",
      "Measured facts:",
      "```",
      facts,
      "```",
      "",
      ...findings.map((f) => `## ${f.area} (${f.severity})\n${f.issue}\n\n**Fix:** ${f.fix}\n`),
    ].join("\n"),
    tags: ["seo", "audit", "own-site"],
  });
  return `${findings.length} on-page finding${findings.length === 1 ? "" : "s"}.`;
}

/** Ad copy. Any spend suggestion inside it is a money item and gets gated. */
export const adCopy = action({
  args: { brief: v.string() },
  handler: async (ctx, { brief }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "seo", trigger: "manual", bubble: "Writing ad copy" },
      async (handle) => {
        const { text } = await think(ctx, {
          botKey: "seo",
          purpose: "draft_ad_copy",
          runId: handle.runId,
          user: `Write ad copy variants.\n\nBrief: ${brief}\n\nNo ranking or traffic promises. Return the ad copy JSON from your instructions.`,
          temperature: 0.9,
          maxOutputTokens: 1400,
        });
        const parsed = parseJson<{ variants?: { headline: string; description: string; angle: string }[] }>(text);
        const variants = parsed.variants ?? [];
        const body = variants
          .map((v2, i) => `### Variant ${i + 1} — ${v2.angle}\n**${v2.headline}**\n${v2.description}`)
          .join("\n\n");

        const verdict = gateAll({ body });
        if (!verdict.clear) {
          await ctx.runMutation(internal.approvals.create, {
            kind: "ad_copy",
            botKey: "seo",
            title: `Ad copy — ${brief.slice(0, 50)}`,
            body,
            reason: verdict.reason,
            guard: verdict.guard!,
            matches: verdict.matches,
          });
          return `${variants.length} variants — held for approval. ${verdict.reason}`;
        }

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "seo",
          kind: "ad_copy",
          title: `Ad copy — ${brief.slice(0, 50)}`,
          body,
          tags: ["ads", "copy"],
        });
        return `${variants.length} ad variant${variants.length === 1 ? "" : "s"} in the Library.`;
      },
    );
    return outcome.summary;
  },
});

/**
 * Campaign monitoring. Reports "not connected" rather than estimating, because
 * estimating spend performance you cannot see is how a bot invents a number
 * that costs real money.
 */
export const campaignStatus = action({
  args: {},
  handler: async (): Promise<{ connected: boolean; message: string }> => {
    if (!process.env.GOOGLE_ADS_REFRESH_TOKEN) {
      return {
        connected: false,
        message:
          "Google Ads is not connected, so there is nothing to monitor. Connecting it needs a developer token from Google, which takes a few days to be approved. Until then this reports nothing rather than guessing.",
      };
    }
    return {
      connected: false,
      message:
        "A Google Ads refresh token is set, but read-only campaign reporting is not implemented — it needs a paid-tier developer token to return live data.",
    };
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.seo.run, { trigger: "manual" }),
});
