"use node";
/**
 * Thabo — Strategy / Analyst.
 *
 * Weekly KPI report, competitor research on demand, and the content calendar
 * everyone else works from.
 *
 * The KPI numbers are read from the database and handed to the model as facts.
 * The model interprets; it never counts. A model asked to "work out the win
 * rate" will produce a plausible number, and a plausible wrong number in a
 * weekly report is worse than no report.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { fetchPage, stripTags } from "../../packages/shared/tools/html";
import { prepareForLlm } from "../../packages/shared/guards/pii";
import { gateAll } from "../../packages/shared/guards";
import { sastDay, DAY_MS } from "../lib/time";

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "strategy", trigger: trigger ?? "cron", bubble: "Writing the weekly report" },
      async (handle) => {
        const report = await weeklyReport(ctx, handle.runId);
        await handle.say("Refreshing the content calendar");
        const calendar = await buildCalendar(ctx, handle.runId);
        return `${report} ${calendar}`;
      },
    );
    return outcome.summary;
  },
});

async function weeklyReport(ctx: Parameters<typeof withRun>[0], runId: string): Promise<string> {
  const weekAgo = Date.now() - 7 * DAY_MS;

  const [leads, emails, drafts, approvals, clients, kpis] = await Promise.all([
    ctx.runQuery(api.leads.list, { limit: 1000 }),
    ctx.runQuery(api.emails.recent, { limit: 1000 }),
    ctx.runQuery(api.library.drafts, { limit: 200 }),
    ctx.runQuery(api.approvals.history, { limit: 200 }),
    ctx.runQuery(api.clients.list, {}),
    ctx.runQuery(api.kpis.headline, {}),
  ]);

  const week = <T extends { createdAt: number }>(rows: T[]) => rows.filter((r) => r.createdAt > weekAgo);

  const sent = week(emails).filter((e) => e.status === "sent" && e.direction === "out");
  const replies = week(emails).filter((e) => e.direction === "in");
  const blocked = week(emails).filter((e) => e.status === "blocked");
  const won = leads.filter((l) => l.status === "won").length;
  const proposals = week(approvals).filter((a) => a.kind === "proposal");

  // Counted here, in code. The model is given these and told to interpret them.
  const facts = [
    `Week ending ${sastDay()}.`,
    `Leads found this week: ${week(leads).filter((l) => l.status !== "discarded").length}. Discarded off-niche: ${week(leads).filter((l) => l.status === "discarded").length}.`,
    `Emails sent: ${sent.length}. Held back by a guard or the cap: ${blocked.length}.`,
    `Replies: ${replies.length}. Reply rate: ${sent.length ? `${Math.round((replies.length / sent.length) * 100)}%` : "n/a — nothing sent"}.`,
    `Interested: ${leads.filter((l) => l.status === "interested").length}. Calls booked: ${leads.filter((l) => l.status === "call_booked").length}.`,
    `Proposals out: ${proposals.length}. Won: ${won}. Lost: ${leads.filter((l) => l.status === "lost").length}.`,
    `Win rate: ${proposals.length ? `${Math.round((won / proposals.length) * 100)}%` : "n/a — no proposals out yet"}.`,
    `Content drafted: ${week(drafts).length}. Posted by Taine: ${drafts.filter((d) => d.status === "posted_by_boss").length}.`,
    `Care plan MRR: R${clients.reduce((n, c) => n + c.monthlyFee, 0)} across ${clients.length} client(s).`,
    `Currently qualified and waiting for outreach: ${kpis.qualified}.`,
  ].join("\n");

  const { text } = await think(ctx, {
    botKey: "strategy",
    purpose: "weekly_kpis",
    runId,
    user: [
      "These are the real counts for the week. Do not recalculate them and do not add numbers that are not here.",
      "",
      facts,
      "",
      "Write the KPI report. Lead with whatever matters most this week, not a fixed order. If a metric is zero, say why you think it is zero. End with the single thing most worth changing.",
    ].join("\n"),
    maxOutputTokens: 1200,
  });

  const parsed = parseJson<{ headline: string; body: string; oneThingToChange: string }>(text);
  const body = [parsed.headline, "", parsed.body, "", `**Worth changing:** ${parsed.oneThingToChange}`]
    .join("\n")
    .trim();

  // Even an internal report goes through the guards — a forecast in a KPI
  // report is exactly the kind of thing that ends up pasted into an email.
  const verdict = gateAll({ report: body });
  if (!verdict.clear) {
    await ctx.runMutation(internal.approvals.create, {
      kind: "content",
      botKey: "strategy",
      title: `Weekly KPI report — ${sastDay()}`,
      body,
      reason: verdict.reason,
      guard: verdict.guard!,
      matches: verdict.matches,
    });
    return "Weekly report written — held for approval, it contained a forward-looking claim.";
  }

  await ctx.runMutation(internal.library.saveDraft, {
    botKey: "strategy",
    kind: "newsletter",
    title: `Weekly KPI report — ${sastDay()}`,
    body,
    tags: ["kpi", "internal", "weekly"],
  });
  return "Weekly report written.";
}

async function buildCalendar(ctx: Parameters<typeof withRun>[0], runId: string): Promise<string> {
  const existing = await ctx.runQuery(api.library.calendar, {});
  const upcoming = existing.filter((d) => (d.calendarDate ?? "") >= sastDay());
  if (upcoming.length >= 4) return `Calendar already has ${upcoming.length} items queued.`;

  const { text } = await think(ctx, {
    botKey: "strategy",
    purpose: "build_content_calendar",
    runId,
    user: [
      `Today is ${sastDay()}. Plan the next 4 content items, one every few days.`,
      "",
      `Already queued: ${upcoming.map((d) => d.title).join("; ") || "nothing"}.`,
      "",
      "Topics must be things a Tier 1, 2 or 3 owner would actually stop and read. A builder in Pinetown does not care about general marketing tips.",
      "Return the content calendar JSON from your instructions.",
    ].join("\n"),
    maxOutputTokens: 1200,
  });

  const parsed = parseJson<{
    items?: { date: string; kind: string; title: string; angle: string; tier: number }[];
  }>(text);
  const valid = new Set(["blog", "linkedin", "instagram", "newsletter", "video_script"]);
  let added = 0;

  for (const item of (parsed.items ?? []).slice(0, 6)) {
    if (!valid.has(item.kind)) continue;
    await ctx.runMutation(internal.library.saveDraft, {
      botKey: "strategy",
      kind: item.kind as "blog",
      title: item.title,
      // Left empty on purpose: this is a calendar slot. The Content bot fills
      // the body in later, working from the angle.
      body: `ANGLE: ${item.angle}`,
      tags: ["calendar", `tier${item.tier}`],
      calendarDate: item.date,
    });
    added++;
  }
  return `${added} item${added === 1 ? "" : "s"} added to the content calendar.`;
}

/** Competitor research on a specific URL, on demand. */
export const research = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "strategy", trigger: "manual", bubble: "Researching a competitor" },
      async (handle) => {
        const page = await fetchPage(url);
        if (!page.html) return `Couldn't read ${url} — ${page.error ?? `status ${page.status}`}.`;

        const { safe } = prepareForLlm(stripTags(page.html).slice(0, 8000));
        const { text } = await think(ctx, {
          botKey: "strategy",
          purpose: "summarise_competitor",
          runId: handle.runId,
          user: [
            `Competitor page: ${url}`,
            "",
            "Page text (contact details replaced with tokens):",
            safe,
            "",
            "Summarise them. Only say what the page actually says. Return the research JSON from your instructions.",
          ].join("\n"),
          maxOutputTokens: 1400,
        });

        const parsed = parseJson<{
          summary: string;
          offers?: string[];
          positioning?: string;
          weaknesses?: string[];
          opportunityForUs?: string;
        }>(text);

        const body = [
          `# ${url}`,
          "",
          parsed.summary,
          "",
          `**Positioning:** ${parsed.positioning ?? "not stated"}`,
          "",
          "**What they offer**",
          ...(parsed.offers ?? []).map((o) => `- ${o}`),
          "",
          "**Where they're weak**",
          ...(parsed.weaknesses ?? []).map((w) => `- ${w}`),
          "",
          `**Opening for us:** ${parsed.opportunityForUs ?? "none obvious"}`,
        ].join("\n");

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "strategy",
          kind: "blog",
          title: `Competitor: ${url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}`,
          body,
          tags: ["research", "competitor"],
        });
        return `Researched ${url} — written up in the Library.`;
      },
    );
    return outcome.summary;
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.strategy.run, { trigger: "manual" }),
});
