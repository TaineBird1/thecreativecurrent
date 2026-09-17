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
import { authedAction } from "../lib/authed";
import { api, internal } from "./../_generated/api";
import { machineArgs } from "../lib/machine";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { fetchPage, stripTags } from "../../packages/shared/tools/html";
import { prepareForLlm } from "../../packages/shared/guards/pii";
import { gateAll, checkClaims } from "../../packages/shared/guards";
import { sastDay, DAY_MS } from "../lib/time";

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "strategy", trigger: trigger ?? "cron", bubble: "Writing the weekly report" },
      async (handle) => {
        // Told to look at something specific? Do that, not the weekly round.
        if (handle.task) {
          const url = /https?:\/\/\S+/.exec(handle.task.detail)?.[0];
          if (url) {
            await handle.say("Researching what you sent");
            return await researchUrl(ctx, url, handle.runId);
          }
        }

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
    ctx.runQuery(api.leads.list, { ...machineArgs(),  limit: 1000 }),
    ctx.runQuery(api.emails.recent, { ...machineArgs(),  limit: 1000 }),
    ctx.runQuery(api.library.drafts, { ...machineArgs(),  limit: 200 }),
    ctx.runQuery(api.approvals.history, { ...machineArgs(),  limit: 200 }),
    ctx.runQuery(api.clients.list, machineArgs()),
    ctx.runQuery(api.kpis.headline, machineArgs()),
  ]);

  const week = <T extends { createdAt: number }>(rows: T[]) => rows.filter((r) => r.createdAt > weekAgo);

  const sent = week(emails).filter((e) => e.status === "sent" && e.direction === "out");
  const replies = week(emails).filter((e) => e.direction === "in");
  const blocked = week(emails).filter((e) => e.status === "blocked");
  const won = leads.filter((l) => l.status === "won").length;
  const proposals = week(approvals).filter((a) => a.kind === "proposal");

  // Which guard stopped what, by name. A blocked email's own row does not say,
  // so it is read off the Approvals row the guard created for it.
  //
  // Only the email ones. Counting every held artefact gave "20 held back by
  // guards (1 claims, 11 money, 11 manual)" — twenty-three inside a bracket
  // labelled twenty, because content drafts and Thabo's own reports were being
  // counted against a number that only ever meant emails. A breakdown that
  // does not add up to the figure beside it makes a reader distrust both.
  const heldThisWeek = week(approvals).filter(
    (a) => a.guard && (a.kind === "outreach_email" || a.kind === "client_email"),
  );
  const byGuard = new Map<string, number>();
  for (const row of heldThisWeek) byGuard.set(row.guard!, (byGuard.get(row.guard!) ?? 0) + 1);
  const blockedByGuard = byGuard.size
    ? ` — ${[...byGuard].map(([g, n]) => `${n} by the ${g} guard`).join(", ")}`
    : "";

  // Counted here, in code. The model is given these and told to interpret them.
  const facts = [
    `Week ending ${sastDay()}.`,
    `Leads found this week: ${week(leads).filter((l) => l.status !== "discarded").length}. Discarded off-niche: ${week(leads).filter((l) => l.status === "discarded").length}.`,
    // Named by guard, not described. Given only a count he guessed at the
    // cause — "likely prohibited language about pricing or guarantees" — which
    // was both unevidenced and, by naming the words the guards look for, enough
    // to trip the claims guard on the report itself. The data was there; he
    // just was not given it.
    `Emails sent: ${sent.length}. Held back before sending: ${blocked.length}${blockedByGuard}.`,
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

  // The claims guard, and only the claims guard.
  //
  // An internal report still needs it: a forecast in a KPI report is exactly
  // the kind of thing that ends up pasted into an email, and that was always
  // the reason for gating this.
  //
  // The money guard is a different matter, and running it here was wrong. This
  // report's whole job is to count money — proposals out, care plan MRR, win
  // rate — so it trips every week, by design, on the thing it was asked to
  // produce. Two reports in a row went to Approvals for the word "proposals"
  // in a sentence saying none had come back. A guard that fires on every
  // instance of an artefact is not protecting anything; it is training whoever
  // reads Approvals to click past it, and that inbox is only worth having
  // while everything in it deserves to be there.
  //
  // Nothing is lost by this: the report is saved to the Library and shown to
  // Taine. It is not sent to anyone, so there is no price here to honour.
  const claims = checkClaims(body);
  if (claims.tripped) {
    await ctx.runMutation(internal.approvals.create, {
      kind: "content",
      botKey: "strategy",
      title: `Weekly KPI report — ${sastDay()}`,
      body,
      reason: claims.reason,
      guard: "claims" as const,
      matches: claims.hits.map((h) => h.match),
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
  const existing = await ctx.runQuery(api.library.calendar, machineArgs());
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
export const research = authedAction({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "strategy", trigger: "manual", bubble: "Researching a competitor" },
      async (handle) => await researchUrl(ctx, url, handle.runId),
    );
    return outcome.summary;
  },
});

export const runNow = authedAction({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.strategy.run, { trigger: "manual" }),
});

/**
 * Read one public page and write up what it says. Shared by the on-demand
 * action and by a link pasted into Thabo's chat box.
 */
async function researchUrl(
  ctx: Parameters<typeof withRun>[0],
  url: string,
  runId: string,
): Promise<string> {
  const page = await fetchPage(url);
  if (!page.html) return `Couldn't read ${url} — ${page.error ?? `status ${page.status}`}.`;

  const { safe } = prepareForLlm(stripTags(page.html).slice(0, 8000));
  const { text } = await think(ctx, {
    botKey: "strategy",
    purpose: "summarise_competitor",
    runId,
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
}
