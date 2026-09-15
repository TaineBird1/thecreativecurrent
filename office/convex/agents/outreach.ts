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

/**
 * The matched proof, by tier. Showing a prospect their own trade converts best.
 *
 * `kind` is the part that matters and the part that was missing. A spec build
 * is a site the studio designed and published to show what it does for a trade
 * — nobody commissioned it. Saying "we built X FOR a contractor in George"
 * about one of those tells a stranger there is a client relationship that does
 * not exist, and it is the single easiest claim in the whole email to check:
 * the prospect phones them. That reads as a lie whether or not one was
 * intended, so the phrasing has to differ by kind, not just the URL.
 *
 * Default to "spec" for anything unconfirmed. Overclaiming costs the studio its
 * credibility with the exact person it is trying to win; underclaiming costs a
 * slightly weaker sentence.
 */
interface ProofSite {
  name: string;
  url: string;
  /**
   * What is on the site, **written as a sentence a person would say out loud**.
   *
   * Not a comma list. This was "bilingual EN/AF, WhatsApp quote button,
   * filterable project gallery", and the model pasted it in behind "It has"
   * exactly as given — because proofInstruction showed it doing that as a GOOD
   * example. A prompt asking for full sentences loses to a worked example
   * sitting next to the data, every time. That is reasonable behaviour by the
   * model and our mistake to have written.
   *
   * Optional, and left out rather than filled in from a guess. A model handed
   * a site with no feature list will happily describe a booking engine that
   * isn't there; on a real client's site that is a claim made about someone
   * else's business to a stranger. Absent means absent — see proofInstruction.
   */
  features?: string;
  /** The kind of business the site is actually for, as a bare noun phrase. */
  siteFor: string;
  kind: "spec" | "client";
}

const SITES: Record<"smit" | "champagne", ProofSite> = {
  smit: {
    name: "SMIT Kontrakteurs",
    // No trailing slash. With one, a model that ends the sentence normally
    // produces ".../ ." — a path segment of a single dot, which some clients
    // pull into the link and break.
    url: "https://smit-kontrakteurs-site.vercel.app",
    features:
      "It runs in English and Afrikaans, and the quote button goes straight to WhatsApp",
    siteFor: "a building contractor",
    kind: "spec",
  },
  champagne: {
    // The only real client build we can show. `features` is deliberately absent
    // until someone who has actually opened the site fills it in — this is a
    // paying client's own business being described to a stranger, which is the
    // worst possible place to guess.
    name: "Champagne Holidays",
    url: "https://www.champagneholidays.com",
    siteFor: "a ski travel company",
    kind: "client",
  },
};

/**
 * Which site to show each tier, and whether it is actually the prospect's own
 * trade.
 *
 * `sameTrade` exists because the honest answer is now usually no. There are two
 * sites to show and three tiers to sell to, so a solar installer gets the
 * contractor build and a guest house gets a ski travel site. Both are fair
 * proof of what the studio can do — neither is proof we have done that
 * prospect's trade before, and a prospect who clicks through discovers the
 * difference in one second. So the model is told which it has and forbidden
 * from blurring it, rather than being left to imply the flattering version.
 */
const PROOF: Record<1 | 2 | 3, { site: keyof typeof SITES; sameTrade: boolean }> = {
  1: { site: "smit", sameTrade: true },
  2: { site: "smit", sameTrade: false },
  3: { site: "champagne", sameTrade: false },
};

/**
 * How the model is allowed to introduce the proof. Not a suggestion — the
 * spec wording never implies anyone commissioned the site, and there is no
 * phrasing available to the model that does.
 */
function proofInstruction(tier: 1 | 2 | 3): string {
  const { site, sameTrade } = PROOF[tier];
  const proof = SITES[site];
  const tradeNote = sameTrade
    ? `This site is for the same trade as the prospect, so you may say so.`
    : [
        `This site is for ${proof.siteFor} — NOT the prospect's trade. Say what it actually is.`,
        `Do not call it "a site like yours", "one in your industry", "the same trade", or anything else that implies we have built for their line of work before. We have not. It is proof of the work, not of the sector.`,
      ].join("\n");
  // Every example below ends the sentence ON the link, never after it. The
  // model copies the shape of these far more faithfully than it follows a rule
  // stated in prose, which is how ".../vercel.app.." reached a prospect.
  const head = proof.features
    ? `Proof to reference: ${proof.name} — ${proof.url}. What is on it, already written as a sentence you may use as-is: "${proof.features}."`
    : [
        `Proof to reference: ${proof.name} — ${proof.url}.`,
        `You do NOT know what is on this site. No feature list was given to you, which means there isn't one — not that you should supply your own.`,
        `Link it and say what kind of business it is for. Do not describe its pages, its booking system, its gallery, its forms, or anything else it may or may not have. Naming a feature you were not told about is inventing one.`,
      ].join("\n");
  if (proof.kind === "client") {
    return [
      head,
      tradeNote,
      `${proof.name} is a real client of ours. You may say we built it for them, and you may name them.`,
      proof.features
        ? `Example: "We built this one for ${proof.siteFor}: ${proof.url}\n\n${proof.features}."`
        : `Example: "We built this one for ${proof.siteFor}: ${proof.url}" Nothing beyond that.`,
    ].join("\n");
  }
  return [
    head,
    tradeNote,
    `IMPORTANT — ${proof.name} is NOT a client. Nobody commissioned this site. We designed and published it ourselves to show the kind of work we do.`,
    `So: do not say we built it FOR them or for anyone. Do not call them a client, a customer, or someone we work with. Do not say they came to us, hired us, or asked us for anything. The word "for" followed by a person or business is the trap.`,
    proof.features
      ? `Introduce it as our own work and nothing more. Good — note the link ends the line, with no full stop after it, and the features are a sentence rather than a list:\n"Here's a site we built to show what this can look like: ${proof.url}\n\n${proof.features}."`
      : `Introduce it as our own work and nothing more, without describing what is on it. Good — the link ends the line, with no full stop after it:\n"Here's a site we built to show what this can look like: ${proof.url}"`,
    `If you cannot reference it without implying someone hired us, leave the proof out entirely and write a shorter email.`,
  ].join("\n");
}

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

  // No name is not a reason to write "Hi there" — that greeting tells the
  // reader in three words that whoever sent this does not know who they are.
  const named = lead.contactName && lead.contactName !== NOT_FOUND ? lead.contactName : null;
  const greeting = named ? `Hi ${named},` : `Hello,`;

  // Why an earlier draft for this lead was turned down. Without this the same
  // objection produces the same email and the rejection loop is invisible.
  const priorRejections: string[] = await ctx.runQuery(api.approvals.rejectionNotesForLead, {
    leadId: lead._id as never,
  });

  const { safe, restoreOutput } = prepareForLlm(
    [
      `Prospect: ${lead.businessName}, a ${lead.category} in ${lead.suburb}.`,
      `Open with exactly this greeting, on its own line: ${greeting}`,
      `Tier: ${lead.tier}`,
      lead.hasWebsite ? `They have a website.` : `They have no website.`,
      "",
      `The one specific thing to open with (quote it close to verbatim, it was measured):`,
      hook,
      "",
      proofInstruction(lead.tier),
      "",
      ...(priorRejections.length
        ? [
            "An earlier draft to this same prospect was rejected. Why:",
            ...priorRejections.map((n) => `- ${n}`),
            "Write a different email that does not repeat that. Do not argue with the objection.",
            "",
          ]
        : []),
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
  const proof = SITES[PROOF[lead.tier].site];
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
      proof.kind === "spec"
        ? `${proof.name} is NOT a client — never say we built it for them or that they hired us, in a follow-up either.`
        : `${proof.name} is a real client.`,
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

  // Full stops welded onto the end of a link. Deterministic, and the cost of
  // one slipping through is a dead link in the only paragraph whose job is to
  // be clicked, so it is repaired here as well as asked for in the prompt.
  //
  // Two separate cases, and the first version only handled one of them — then
  // the trailing slash it keyed on was removed in the same commit, so it
  // matched nothing at all and ".../vercel.app.." went out anyway.
  //
  //  - after a "/", any dots go: a path of "/." or "/.." is never intended.
  text = text.replace(/(https?:\/\/[^\s<>"']*\/)\.{1,2}(?=\s|$)/g, "$1");
  //  - otherwise only a RUN of dots collapses to one. A single full stop after
  //    a link is ordinary sentence punctuation and is left alone; two never
  //    are.
  text = text.replace(/(https?:\/\/[^\s<>"']*[^\s<>"'.])\.{2,}(?=\s|$)/g, "$1.");

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
  // "Regards," rather than a bare em dash. The dash was doing the job of a
  // sign-off without being one, which reads as a note rather than a letter —
  // the same abruptness that made the rest of these emails feel automated.
  return `${text.trim()}\n\nRegards,\nTaine\nThe Creative Current · Durban\nthecreativecurrent.co.za\n\nIf you'd rather I didn't email again, just reply "no thanks" and I'll take you off.`;
}

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.outreach.run, { trigger: "manual" }),
});
