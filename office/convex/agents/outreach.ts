"use node";
/**
 * Lerato — Outreach / Sales.
 *
 * The only bot that sends anything on its own, and therefore the one with the
 * most rails around it:
 *
 *   - Every send goes through convex/outbound.ts, which enforces the kill
 *     switch, the pause switch, the 20/day cap, the template check, and the
 *     money and claims guards. This bot cannot bypass any of it; it has no
 *     other way to reach the network.
 *   - It only ever writes ONE email at a time, for one named prospect, quoting
 *     one specific fact measured from that prospect's own site.
 *   - The sequence stops on reply. Always, immediately, no exceptions.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { prepareForLlm } from "../../packages/shared/guards/pii";
import { headlineFault } from "../../packages/shared/tools/faults";
import { proposeCallTimes } from "../../packages/shared/tools/ics";
import { isOfficeHoursSast } from "../lib/time";
import { NOT_FOUND } from "../../packages/shared/tools/contacts";

/** Per 30-minute run. The daily cap is enforced separately in outbound.ts.
 *  Day 3 / day 8 follow-up timing lives in convex/sequences.ts, which owns the
 *  state machine — one place, so the two can't disagree. */
const MAX_PER_RUN = 3;

/** The matched proof, by tier. Showing a prospect their own trade converts best. */
const PROOF: Record<1 | 2 | 3, { name: string; url: string; why: string }> = {
  1: {
    name: "SMIT Kontrakteurs",
    url: "smitkontrakteurs.co.za",
    why: "a contractor in George — bilingual, WhatsApp quote button, filterable project gallery",
  },
  2: {
    name: "Renu Solar",
    url: "renusolar.co.za",
    why: "a solar installer in Hillcrest — savings calculator and a quote form",
  },
  3: {
    name: "a guest lodge direct-booking site",
    url: "thecreativecurrent.co.za",
    why: "built so guests book direct instead of through the OTAs",
  },
};

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "outreach", trigger: trigger ?? "cron", bubble: "Checking who to write to" },
      async (handle) => {
        // Nobody wants a cold email at 21:00 on a Sunday.
        if (trigger !== "manual" && !isOfficeHoursSast()) {
          return "Outside office hours — nothing sent.";
        }

        // Writing emails that cannot leave the building is not free. Each one
        // costs a model call, and on a half-hourly schedule that is the same
        // three drafts rewritten all day. Check the door before doing the work.
        const canSend = await ctx.runQuery(api.settings.sendState, {});
        if (!canSend.senderEmail || canSend.paused) {
          const waiting = await ctx.runQuery(api.leads.draftedNotSent, {});
          return canSend.paused
            ? `Sending is paused, so I haven't written anything new. ${waiting} draft(s) already waiting.`
            : `No sender address configured, so nothing can leave the building — I haven't written anything new rather than spend the budget on it. ${waiting} draft(s) already waiting for when you set one in Settings.`;
        }

        const notes: string[] = [];

        // 1. Follow-ups that are due take priority over new first touches:
        //    a started conversation is worth more than another cold one.
        const due = await ctx.runQuery(api.sequences.due, { limit: MAX_PER_RUN });
        for (const seq of due) {
          if (await handle.stopped()) return "Stopped mid-run.";
          await handle.say(`Following up with ${seq.lead.businessName}`);
          notes.push(await sendFollowUp(ctx, seq, handle.runId));
        }

        // 2. New first touches with whatever room is left.
        const room = MAX_PER_RUN - due.length;
        if (room > 0) {
          const fresh = await ctx.runQuery(api.leads.readyForOutreach, { limit: room });
          for (const lead of fresh) {
            if (await handle.stopped()) return "Stopped mid-run.";
            await handle.say(`Writing to ${lead.businessName}`);
            notes.push(await sendFirstTouch(ctx, lead, handle.runId));
          }
        }

        if (notes.length === 0) {
          // Idle is an acceptable state. It never fills the time with off-niche work.
          return "Nothing to send — no qualified leads waiting and no follow-ups due.";
        }
        return notes.join(" ");
      },
    );
    return outcome.summary;
  },
});

async function sendFirstTouch(
  ctx: Parameters<typeof withRun>[0],
  lead: {
    _id: string;
    businessName: string;
    contactName?: string;
    tier: 1 | 2 | 3;
    category: string;
    email: string;
    suburb: string;
    websiteUrl: string;
    hasWebsite: boolean;
    faults: { code: string; detail: string; severity: "high" | "medium" | "low" }[];
    facebookActivity?: string;
  },
  runId: string,
): Promise<string> {
  const fault = headlineFault(lead.faults);
  const hook = fault?.detail ?? lead.facebookActivity ?? null;

  // No specific, verifiable fact means no email. A generic cold email is worse
  // than none — it burns the prospect and teaches them to ignore us.
  if (!hook) {
    await ctx.runMutation(internal.leads.patchLead, {
      id: lead._id as never,
      patch: {},
      event: {
        type: "skipped",
        detail:
          "Nothing specific enough to write about — no measured site fault and no note on what their Facebook page does. Left alone rather than sent something generic.",
        botKey: "outreach",
      },
    });
    return `Skipped ${lead.businessName} — nothing specific to say.`;
  }

  const proof = PROOF[lead.tier];
  const greeting =
    lead.contactName && lead.contactName !== NOT_FOUND ? lead.contactName : "there";

  const { safe, restoreOutput } = prepareForLlm(
    [
      `Prospect: ${lead.businessName}, a ${lead.category} in ${lead.suburb}.`,
      `Greet them as: ${greeting}`,
      `Tier: ${lead.tier}`,
      lead.hasWebsite ? `They have a website.` : `They have no website.`,
      "",
      `The one specific thing to open with (quote it close to verbatim, it was measured):`,
      hook,
      "",
      `Proof to reference: ${proof.name} (${proof.url}) — ${proof.why}.`,
      "",
      "Write the first email. Under 120 words, one clear ask, a short lowercase subject.",
      "No price. No promise about rankings, traffic or enquiries. No timeframe on a result.",
    ].join("\n"),
    [lead.contactName ?? "", lead.businessName],
  );

  const { text } = await think(ctx, {
    botKey: "outreach",
    purpose: "draft_first_email",
    user: safe,
    runId,
    temperature: 0.85, // genuinely varied wording, not shuffled synonyms
    maxOutputTokens: 2400,
  });

  const draft = parseJson<{ subject: string; body: string }>(text);
  const subject = restoreOutput(draft.subject ?? "").trim();
  const body = restoreOutput(draft.body ?? "").trim();

  if (!subject || !body) return `${lead.businessName}: the model returned an empty draft.`;

  const outcome = await ctx.runAction(internal.outbound.sendEmail, {
    botKey: "outreach",
    to: lead.email,
    subject,
    body: withSignature(body),
    leadId: lead._id as never,
    sequenceStep: 1,
    personalisation: [lead.businessName, lead.contactName ?? "", lead.suburb, lead.category, hook],
    runId,
  });

  if (outcome.sent) {
    await ctx.runMutation(internal.sequences.start, { leadId: lead._id as never });
    await ctx.runMutation(internal.leads.patchLead, {
      id: lead._id as never,
      patch: { status: "contacted" },
      event: { type: "contacted", detail: `First email sent. Opened with: "${hook}"`, botKey: "outreach" },
    });
    return `Emailed ${lead.businessName}.`;
  }
  return `${lead.businessName}: ${outcome.reason}`;
}

async function sendFollowUp(
  ctx: Parameters<typeof withRun>[0],
  seq: {
    _id: string;
    step: number;
    lead: {
      _id: string;
      businessName: string;
      contactName?: string;
      tier: 1 | 2 | 3;
      email: string;
      suburb: string;
      category: string;
      faults: { code: string; detail: string; severity: "high" | "medium" | "low" }[];
    };
    previousBodies: string[];
  },
  runId: string,
): Promise<string> {
  const nextStep = seq.step + 1;
  const isLast = nextStep >= 3;
  const lead = seq.lead;
  const proof = PROOF[lead.tier];
  const secondary = lead.faults.filter((f) => f.detail !== (headlineFault(lead.faults)?.detail))[0];

  const { safe, restoreOutput } = prepareForLlm(
    [
      `Prospect: ${lead.businessName}, a ${lead.category} in ${lead.suburb}.`,
      `This is follow-up ${nextStep - 1} of 2. ${isLast ? "This is the LAST one — say plainly you'll leave it there, and mean it." : ""}`,
      "",
      "What you already sent them:",
      ...seq.previousBodies.map((b, i) => `--- email ${i + 1} ---\n${b}`),
      "",
      secondary
        ? `One NEW specific thing you have not mentioned yet: ${secondary.detail}`
        : `You have no new fact to add. Keep it to two sentences and make the ask smaller.`,
      `Proof already referenced: ${proof.name}.`,
      "",
      "Under 60 words. Add something new — a follow-up is not a reminder that you emailed.",
      "No price, no promise, no timeframe on a result.",
    ].join("\n"),
    [lead.contactName ?? "", lead.businessName],
  );

  const { text } = await think(ctx, {
    botKey: "outreach",
    purpose: "draft_followup",
    user: safe,
    runId,
    temperature: 0.85,
    maxOutputTokens: 1600,
  });

  const draft = parseJson<{ subject: string; body: string }>(text);
  const outcome = await ctx.runAction(internal.outbound.sendEmail, {
    botKey: "outreach",
    to: lead.email,
    subject: restoreOutput(draft.subject ?? "").trim() || `following up`,
    body: withSignature(restoreOutput(draft.body ?? "").trim()),
    leadId: lead._id as never,
    sequenceStep: nextStep,
    personalisation: [lead.businessName, lead.contactName ?? "", lead.suburb, lead.category],
    runId,
  });

  if (outcome.sent) {
    await ctx.runMutation(internal.sequences.advance, { id: seq._id as never, step: nextStep });
    return `Followed up with ${lead.businessName} (${nextStep}/3).`;
  }
  return `${lead.businessName} follow-up: ${outcome.reason}`;
}

/**
 * Handle a reply. Classify, stop the sequence, and draft a response.
 *
 * Nothing here sends by itself except a straightforward proposal of call times.
 * Anything needing a price goes to Approvals via the money guard in outbound.ts.
 */
export const handleReply = internalAction({
  args: { emailId: v.id("emails"), leadId: v.id("leads"), body: v.string() },
  handler: async (ctx, { emailId, leadId, body }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "outreach", trigger: "manual", bubble: "Reading a reply" },
      async (handle) => {
        const detail = await ctx.runQuery(api.leads.byId, { id: leadId });
        if (!detail) return "That lead is gone.";
        const { lead } = detail;

        // Stop the sequence FIRST, before any model call. If the classification
        // step fails, the worst outcome must still be "we stopped emailing them".
        await ctx.runMutation(internal.sequences.stop, { leadId, reason: "replied" });

        const { safe, restoreOutput } = prepareForLlm(
          [
            `You emailed ${lead.businessName} (a ${lead.category} in ${lead.suburb}).`,
            "",
            "Their reply:",
            body,
            "",
            "Classify it and draft a response. If answering properly needs a price, draft it anyway and say Taine will confirm the figure — do not guess a number.",
          ].join("\n"),
          [lead.contactName ?? "", lead.businessName],
        );

        const { text } = await think(ctx, {
          botKey: "outreach",
          purpose: "classify_reply",
          user: safe,
          runId: handle.runId,
          maxOutputTokens: 2000,
        });

        const parsed = parseJson<{
          classification: "interested" | "not_now" | "no" | "question" | "auto_reply";
          suggestedReply: string;
          needsBoss?: boolean;
          reason?: string;
        }>(text);

        await ctx.runMutation(internal.emails.classify, {
          id: emailId,
          classification: parsed.classification,
        });

        const statusByClass = {
          interested: "interested",
          question: "replied",
          not_now: "not_now",
          no: "no",
          auto_reply: "contacted",
        } as const;

        await ctx.runMutation(internal.leads.patchLead, {
          id: leadId,
          patch: { status: statusByClass[parsed.classification] },
          event: {
            type: "replied",
            detail: `Reply classified as "${parsed.classification}". ${parsed.reason ?? ""}`.trim(),
            botKey: "outreach",
          },
        });

        if (parsed.classification === "no" || parsed.classification === "auto_reply") {
          return `${lead.businessName} said no — sequence stopped, no reply drafted.`;
        }

        let reply = restoreOutput(parsed.suggestedReply ?? "").trim();

        if (parsed.classification === "interested") {
          const settings = await ctx.runQuery(api.settings.sendState, {});
          const times = proposeCallTimes();
          reply += `\n\n${times.map((t) => `- ${t.label}`).join("\n")}`;
          if (settings.bookingUrl) {
            reply += `\n\nOr pick a time that suits you: ${settings.bookingUrl}`;
          }
        }

        if (parsed.needsBoss) {
          await ctx.runMutation(internal.escalations.raise, {
            botKey: "outreach",
            title: `${lead.businessName} asked something I shouldn't answer`,
            detail: `${parsed.reason ?? "Needs your judgement."}\n\nTheir reply:\n${body}`,
            severity: "urgent",
          });
          return `${lead.businessName} replied — escalated to you rather than answered.`;
        }

        const sendOutcome = await ctx.runAction(internal.outbound.sendEmail, {
          botKey: "outreach",
          to: lead.email,
          subject: `re: your reply`,
          body: withSignature(reply),
          leadId,
          personalisation: [lead.businessName, lead.contactName ?? "", lead.suburb],
          countsAgainstCap: false, // a reply is a conversation, not cold outreach
          runId: handle.runId,
        });

        return sendOutcome.sent
          ? `Replied to ${lead.businessName} (${parsed.classification}).`
          : `${lead.businessName}: ${sendOutcome.reason}`;
      },
    );
    return outcome.summary;
  },
});

/**
 * Log a reply that arrived in Taine's inbox.
 *
 * There is no free, reliable inbound email API on Resend's free tier, so
 * replies are not fetched automatically — he pastes them in. That is a real
 * limitation and the UI says so rather than implying the bot is watching.
 */
export const logReply = action({
  args: { leadId: v.id("leads"), body: v.string(), from: v.optional(v.string()) },
  handler: async (ctx, { leadId, body, from }): Promise<string> => {
    const detail = await ctx.runQuery(api.leads.byId, { id: leadId });
    if (!detail) throw new Error("That lead is gone.");
    const emailId = await ctx.runMutation(internal.emails.record, {
      botKey: "outreach",
      direction: "in" as const,
      to: "(your inbox)",
      from: from ?? detail.lead.email,
      subject: "Reply",
      body,
      leadId,
      status: "received" as const,
    });
    return await ctx.runAction(internal.agents.outreach.handleReply, { emailId, leadId, body });
  },
});

/** Bot names that must never reach a prospect. */
const BOT_NAMES = ["Lerato", "Nomsa", "Thabo", "Sipho", "Anele", "Zanele", "Kagiso", "Naledi", "Bongi"];

function withSignature(body: string): string {
  let text = body.trim();

  // The prompt says not to sign off, but a model that does it anyway would put
  // two different names on one email — "Regards, Lerato" above "Taine" — and
  // the prospect is being written to by Taine. Strip any sign-off that ends on
  // a bot's name rather than trusting the instruction held.
  const signOff = new RegExp(
    `\\n+\\s*(?:regards|kind regards|best|best regards|thanks|cheers|all the best|warm regards)[,.]?\\s*\\n+\\s*(?:${BOT_NAMES.join("|")})\\s*$`,
    "i",
  );
  text = text.replace(signOff, "");
  // Or a bare name on the last line.
  text = text.replace(new RegExp(`\\n+\\s*(?:${BOT_NAMES.join("|")})\\s*$`, "i"), "");

  // POPIA: an opt-out line on every unsolicited message, every time.
  return `${text.trim()}\n\n—\nTaine\nThe Creative Current · Durban\nthecreativecurrent.co.za\n\nIf you'd rather I didn't email again, just reply "no thanks" and I'll take you off.`;
}

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.outreach.run, { trigger: "manual" }),
});
