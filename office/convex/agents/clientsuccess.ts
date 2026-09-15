"use node";
/**
 * Bongi — Client Success.
 *
 * Looks after the people who already pay us. Two rules shape the whole file:
 *
 *  - An outage escalates to Taine BEFORE any client-facing draft exists. He
 *    should never find out a client's site is down by reading an email a bot
 *    drafted to that client.
 *  - Anything with a cost attached is flagged and routed to Approvals. This bot
 *    never tells a client something is included, free, or extra.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { gateAll } from "../../packages/shared/guards";
import { prepareForLlm } from "../../packages/shared/guards/pii";

/** Free uptime monitoring: a Convex cron and a fetch. No third-party service. */
export const uptimeSweep = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "clientsuccess", trigger: "cron", bubble: "Checking client sites" },
      async (handle) => {
        const clients = await ctx.runQuery(api.clients.list, {});
        if (clients.length === 0) return "No clients to check yet.";

        let down = 0;
        for (const client of clients) {
          if (await handle.stopped()) return "Stopped mid-sweep.";
          if (!client.siteUrl || !client.siteUrl.startsWith("http")) continue;

          const started = Date.now();
          let ok = false;
          let statusCode: number | undefined;
          let error: string | undefined;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15_000);
            const res = await fetch(client.siteUrl, {
              signal: controller.signal,
              // HEAD is cheaper, but plenty of hosts answer it wrongly. GET is
              // what a visitor does, so it is what we measure.
              method: "GET",
              headers: { "user-agent": "TheCreativeCurrentOffice/1.0 (uptime check)" },
            });
            clearTimeout(timer);
            statusCode = res.status;
            ok = res.ok;
            if (!ok) error = `HTTP ${res.status}`;
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          const result = await ctx.runMutation(internal.clients.recordCheck, {
            clientId: client._id,
            ok,
            statusCode,
            responseMs: Date.now() - started,
            error,
          });

          // One failure is noise. Two in a row is an outage.
          if (result.outage) {
            down++;
            await ctx.runMutation(internal.escalations.raise, {
              botKey: "clientsuccess",
              title: `${client.businessName}'s site is down`,
              detail: [
                `${client.siteUrl} has failed two checks in a row.`,
                `Last error: ${error ?? "no response"}`,
                statusCode ? `Status code: ${statusCode}` : "",
                `30-day uptime is now ${result.percent}%.`,
                "",
                "Nothing has been sent to the client. That's your call.",
              ]
                .filter(Boolean)
                .join("\n"),
              severity: "urgent",
            });
          }
        }

        return down > 0
          ? `${down} client site${down === 1 ? " is" : "s are"} down — escalated to you.`
          : `All ${clients.length} client site${clients.length === 1 ? "" : "s"} up.`;
      },
    );
    return outcome.summary;
  },
});

/** Monthly health check per client, plus change-request triage. */
export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "clientsuccess", trigger: trigger ?? "cron", bubble: "Monthly health checks" },
      async (handle) => {
        const clients = await ctx.runQuery(api.clients.list, {});
        if (clients.length === 0) return "No clients yet — nothing to report on.";

        const notes: string[] = [];

        for (const client of clients) {
          if (await handle.stopped()) break;
          await handle.say(`Health check: ${client.businessName.slice(0, 25)}`);

          const detail = await ctx.runQuery(api.clients.byId, { id: client._id });
          if (!detail) continue;

          const monthAgo = Date.now() - 30 * 24 * 60 * 60_000;
          const checks = detail.checks.filter((c) => c.createdAt > monthAgo);
          const failures = checks.filter((c) => !c.ok);
          const requests = detail.requests;

          const facts = [
            `Client: ${client.businessName} (${client.carePlanTier} care plan)`,
            `Uptime over 30 days: ${client.uptimePercent30d}% from ${checks.length} checks.`,
            failures.length
              ? `${failures.length} failed check(s). Errors seen: ${[...new Set(failures.map((f) => f.error ?? "no response"))].join(", ")}.`
              : "No failed checks.",
            `Change requests: ${requests.filter((r) => r.status === "done").length} closed, ${requests.filter((r) => r.status !== "done").length} still open.`,
            requests.length
              ? `Open ones: ${requests.filter((r) => r.status !== "done").map((r) => r.description).slice(0, 5).join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n");

          const { safe } = prepareForLlm(facts, [client.contactName, client.businessName]);
          const { text } = await think(ctx, {
            botKey: "clientsuccess",
            purpose: "health_check",
            runId: handle.runId,
            user: `${safe}\n\nWrite the monthly health check. If the month was uneventful, say so — do not invent activity.\nReturn the health check JSON from your instructions.`,
            maxOutputTokens: 1800,
          });

          const parsed = parseJson<{
            uptimeSummary?: string;
            incidents?: string[];
            requestsSummary?: string;
            suggestionNextMonth?: string;
          }>(text);

          await ctx.runMutation(internal.library.saveDraft, {
            botKey: "clientsuccess",
            kind: "newsletter",
            title: `Health check — ${client.businessName} — ${new Date().toISOString().slice(0, 7)}`,
            body: [
              `# ${client.businessName} — monthly health check`,
              "",
              parsed.uptimeSummary ?? `Uptime: ${client.uptimePercent30d}%.`,
              "",
              ...(parsed.incidents?.length ? ["**Incidents**", ...parsed.incidents.map((i) => `- ${i}`), ""] : []),
              parsed.requestsSummary ?? "",
              "",
              parsed.suggestionNextMonth ? `**Next month:** ${parsed.suggestionNextMonth}` : "",
            ].join("\n"),
            tags: ["health-check", client.businessName],
          });
          notes.push(client.businessName);
        }

        const triaged = await triageRequests(ctx, handle.runId);
        return `Health checks written for ${notes.length} client${notes.length === 1 ? "" : "s"}. ${triaged}`;
      },
    );
    return outcome.summary;
  },
});

/**
 * Triage change requests. A request with a cost attached is flagged and sent to
 * Approvals — never answered directly, never priced, never called "free".
 */
async function triageRequests(ctx: Parameters<typeof withRun>[0], runId: string): Promise<string> {
  const open = await ctx.runQuery(api.clients.untriagedRequests, {});
  if (open.length === 0) return "No new change requests.";

  let flagged = 0;
  for (const request of open.slice(0, 8)) {
    const { text } = await think(ctx, {
      botKey: "clientsuccess",
      purpose: "triage_change_request",
      runId,
      tier: "cheap",
      user: `A client asked for this:\n\n"${request.description}"\n\nIs it inside a normal care plan, or does it have a cost attached (extra pages, a new feature, anything outside the plan)?\nReturn the change request triage JSON from your instructions.`,
      maxOutputTokens: 1000,
    });

    const parsed = parseJson<{ summary?: string; costFlagged?: boolean; why?: string }>(text);
    if (!parsed.costFlagged) continue;

    const approvalId = await ctx.runMutation(internal.approvals.create, {
      kind: "change_request_cost",
      botKey: "clientsuccess",
      title: `${request.businessName}: ${parsed.summary ?? request.description.slice(0, 60)}`,
      body: [
        `**They asked for:** ${request.description}`,
        "",
        `**Why this has a cost attached:** ${parsed.why ?? "outside the care plan"}`,
        "",
        "Nothing has been said to the client. What it costs, or whether it's included, is yours to decide.",
      ].join("\n"),
      reason: "A change request with a cost attached. Pricing is never the bot's call.",
      guard: "money",
      matches: [request.description.slice(0, 120)],
      clientId: request.clientId,
    });
    await ctx.runMutation(internal.clients.flagRequestCost, { id: request._id, approvalId });
    flagged++;
  }
  return flagged > 0
    ? `${flagged} change request${flagged === 1 ? "" : "s"} flagged as having a cost — in Approvals.`
    : `${open.length} change request${open.length === 1 ? "" : "s"} triaged, none with a cost attached.`;
}

/** Check-in or renewal email. Goes through the same gate as everything else. */
export const draftEmail = action({
  args: {
    clientId: v.id("clients"),
    kind: v.union(v.literal("checkin"), v.literal("renewal")),
  },
  handler: async (ctx, { clientId, kind }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "clientsuccess", trigger: "manual", bubble: `Drafting a ${kind}` },
      async (handle) => {
        const detail = await ctx.runQuery(api.clients.byId, { id: clientId });
        if (!detail) return "That client is gone.";
        const { client } = detail;

        const { safe, restoreOutput } = prepareForLlm(
          [
            `Client: ${client.businessName}, contact ${client.contactName}.`,
            `Care plan: ${client.carePlanTier}. Uptime over 30 days: ${client.uptimePercent30d}%.`,
            client.renewalDate ? `Renewal date: ${client.renewalDate}.` : "",
            "",
            kind === "checkin"
              ? "Write a check-in. Ask how the site is working for them and whether anything needs changing. That is all. No upsell."
              : "Write a renewal reminder. Warm, short, no pressure. Do not state the fee — Taine confirms figures.",
          ]
            .filter(Boolean)
            .join("\n"),
          [client.contactName, client.businessName],
        );

        const { text } = await think(ctx, {
          botKey: "clientsuccess",
          purpose: `draft_${kind}`,
          runId: handle.runId,
          user: safe,
          maxOutputTokens: 1400,
        });

        const parsed = parseJson<{ subject: string; body: string }>(text);
        const subject = restoreOutput(parsed.subject ?? "").trim();
        const body = restoreOutput(parsed.body ?? "").trim();
        if (!body) return "The model returned an empty draft.";

        const verdict = gateAll({ subject, body });
        if (!verdict.clear) {
          await ctx.runMutation(internal.approvals.create, {
            kind: "client_email",
            botKey: "clientsuccess",
            title: `${kind} — ${client.businessName}`,
            body,
            reason: verdict.reason,
            guard: verdict.guard!,
            matches: verdict.matches,
            payload: { to: client.email, subject, personalisation: [client.contactName, client.businessName] },
            clientId,
          });
          return `Drafted — held for approval. ${verdict.reason}`;
        }

        const sendOutcome = await ctx.runAction(internal.outbound.sendEmail, {
          botKey: "clientsuccess",
          to: client.email,
          subject,
          body,
          clientId,
          personalisation: [client.contactName, client.businessName],
          countsAgainstCap: false, // an existing client is not cold outreach
          runId: handle.runId,
        });
        return sendOutcome.reason;
      },
    );
    return outcome.summary;
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.clientsuccess.run, { trigger: "manual" }),
});

export const sweepNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.clientsuccess.uptimeSweep, {}),
});
