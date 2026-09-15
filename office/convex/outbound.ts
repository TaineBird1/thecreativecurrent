"use node";
/**
 * The only door out of the building.
 *
 * Every email — first touch, follow-up, reply, client check-in — goes through
 * `sendEmail` here. Nothing calls Resend directly. That is what makes the
 * guarantees in the README true rather than aspirational: there is exactly one
 * place to audit.
 *
 * Order of checks, and why:
 *   1. Kill switch        — checked here AND re-checked immediately before the
 *                           network call, so a STOP mid-batch stops the batch.
 *   2. Pause sending      — the softer switch.
 *   3. Sender configured  — no address, no sending. Not a silent no-op: it says so.
 *   4. Daily cap          — 20 outreach emails a day, counted in SAST days.
 *   5. Orphan tokens      — a pseudonym the restore step failed to swap back.
 *                           Never an approval: it is simply not fit to send.
 *   6. Template check     — skeleton similarity against recent sends.
 *   7. Money + claims     — anything that trips goes to Approvals instead.
 */
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { gateAll } from "../packages/shared/guards";
import { skeleton, checkAgainstRecent } from "../packages/shared/guards/similarity";
import { hasOrphanTokens } from "../packages/shared/guards/pii";
import { checkHalt } from "./lib/killSwitch";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendOutcome {
  sent: boolean;
  /** Set when a guard routed it to Approvals instead of sending. */
  approvalId?: string;
  reason: string;
}

/**
 * Send an email, or route it to Approvals. Returns which happened — callers
 * must not assume a send.
 */
export const sendEmail = internalAction({
  args: {
    botKey: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    leadId: v.optional(v.id("leads")),
    clientId: v.optional(v.id("clients")),
    sequenceStep: v.optional(v.number()),
    /** Fields that are supposed to differ per recipient, for the template check. */
    personalisation: v.optional(v.array(v.string())),
    /** Outreach counts against the 20/day cap. Client emails do not. */
    countsAgainstCap: v.optional(v.boolean()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SendOutcome> => {
    const state = await ctx.runQuery(api.settings.sendState, {});

    if (state.halted) {
      await recordBlocked(ctx, args, `STOP is engaged${state.reason ? `: ${state.reason}` : ""}.`);
      return { sent: false, reason: "STOP is engaged. Nothing was sent." };
    }
    if (state.paused) {
      await recordBlocked(ctx, args, "Sending is paused.");
      return { sent: false, reason: "Sending is paused — the switch in the header is off." };
    }
    if (!state.senderEmail) {
      await recordBlocked(ctx, args, "No sender address configured.");
      return {
        sent: false,
        reason:
          "No sender address is configured, so nothing can be sent. Set one in Settings once your Resend domain is verified.",
      };
    }

    const countsAgainstCap = args.countsAgainstCap ?? true;
    if (countsAgainstCap) {
      const cap = await ctx.runQuery(api.emails.sentTodayCount, {});
      if (cap.count >= state.dailySendCap) {
        await recordBlocked(
          ctx,
          args,
          `Daily send cap reached (${cap.count}/${state.dailySendCap}).`,
        );
        return {
          sent: false,
          reason: `Daily cap of ${state.dailySendCap} outreach emails reached. This one waits for tomorrow.`,
        };
      }
    }

    // ── Unreplaced pseudonym tokens ───────────────────────────────────────
    //
    // Contact details are swapped for «PERSON_1»-style tokens before anything
    // reaches the model, and swapped back in its reply. When that restore
    // misses — the model returns «URL_1» as <URL_1>, say — the token travels
    // all the way to the recipient. It has: a prospect got "Here's a site we
    // built — <URL_1>", with the proof link that paragraph exists for replaced
    // by a placeholder.
    //
    // This is never a judgement call and never worth an approval: nothing with
    // a token left in it is fit to send. `hasOrphanTokens` was written for this
    // and then never called from anywhere, which is why the email went out.
    if (hasOrphanTokens(args.body) || hasOrphanTokens(args.subject)) {
      await recordBlocked(ctx, args, "Unreplaced pseudonym token in the text.");
      return {
        sent: false,
        reason:
          "Blocked: a placeholder token (URL_1, PERSON_1 or similar) survived into the text. " +
          "The real value never got put back, so this would have reached the recipient as-is. Re-draft it.",
      };
    }

    // ── Template check ────────────────────────────────────────────────────
    // Compare skeletons, not raw text: two emails identical apart from the
    // business name score low on raw text and would slip straight through.
    const personalisation = args.personalisation ?? [];
    const candidateSkeleton = skeleton(args.body, personalisation);
    if (countsAgainstCap) {
      const recent = await ctx.runQuery(api.emails.recentSkeletons, { limit: 50 });
      const verdict = checkAgainstRecent(candidateSkeleton, recent, state.similarityCeiling);
      if (verdict.tooSimilar) {
        await recordBlocked(
          ctx,
          args,
          `Too close to a recent send (${Math.round(verdict.score * 100)}% identical once the names are stripped out).`,
        );
        return {
          sent: false,
          reason: `This reads as a template — ${Math.round(verdict.score * 100)}% identical to a recent send once the personal details are stripped out. Rewrite it properly or send nothing.`,
        };
      }
    }

    // ── Money and claims ──────────────────────────────────────────────────
    const verdict = gateAll({ subject: args.subject, body: args.body });
    if (!verdict.clear) {
      const approvalId = await ctx.runMutation(internal.approvals.create, {
        kind: args.leadId ? "outreach_email" : "client_email",
        botKey: args.botKey,
        title: `${args.subject} → ${args.to}`,
        body: args.body,
        reason: verdict.reason,
        guard: verdict.guard!,
        matches: verdict.matches,
        payload: {
          to: args.to,
          subject: args.subject,
          sequenceStep: args.sequenceStep,
          personalisation,
        },
        leadId: args.leadId,
        clientId: args.clientId,
      });
      await recordBlocked(ctx, args, `Held for approval: ${verdict.reason}`);
      return { sent: false, approvalId, reason: `Held for your approval. ${verdict.reason}` };
    }

    return await deliver(ctx, {
      ...args,
      from: `${state.senderName} <${state.senderEmail}>`,
      replyTo: state.replyToEmail || state.senderEmail,
      bodySkeleton: candidateSkeleton,
    });
  },
});

/** Send something Taine explicitly approved. Guards already ran; the kill switch has not. */
export const sendApproved = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, { approvalId }): Promise<string> => {
    const approval = await ctx.runQuery(api.approvals.byId, { id: approvalId });
    if (!approval) throw new Error("That approval no longer exists.");
    if (approval.status !== "approved") throw new Error("That approval has not been approved.");

    const state = await ctx.runQuery(api.settings.sendState, {});
    // Re-checked here, not just at approval time: STOP may have been engaged in
    // between, and STOP overrides an approval.
    if (state.halted) throw new Error("STOP is engaged. Nothing was sent.");
    if (state.paused) throw new Error("Sending is paused. Nothing was sent.");
    if (!state.senderEmail) throw new Error("No sender address configured. Nothing was sent.");

    const payload = (approval.payload ?? {}) as {
      to?: string;
      subject?: string;
      sequenceStep?: number;
      personalisation?: string[];
    };
    const body = approval.editedBody ?? approval.body;

    const outcome = await deliver(ctx, {
      botKey: approval.botKey,
      to: payload.to ?? "",
      subject: payload.subject ?? approval.title,
      body,
      leadId: approval.leadId ?? undefined,
      clientId: approval.clientId ?? undefined,
      sequenceStep: payload.sequenceStep,
      from: `${state.senderName} <${state.senderEmail}>`,
      replyTo: state.replyToEmail || state.senderEmail,
      bodySkeleton: skeleton(body, payload.personalisation ?? []),
      runId: undefined,
    });
    return outcome.reason;
  },
});

/** The actual network call. Nothing else in the codebase talks to Resend. */
async function deliver(
  ctx: ActionCtx,
  args: {
    botKey: string;
    to: string;
    subject: string;
    body: string;
    from: string;
    replyTo: string;
    bodySkeleton: string;
    leadId?: string;
    clientId?: string;
    sequenceStep?: number;
    runId?: string;
  },
): Promise<SendOutcome> {
  // Last check before the packet leaves. A STOP during a 20-email loop must
  // stop the loop, not merely prevent the 21st.
  const halt = await checkHalt(ctx);
  if (halt.halted) {
    await ctx.runMutation(internal.emails.record, {
      ...baseEmail(args),
      status: "blocked" as const,
      error: "STOP engaged before delivery.",
    });
    return { sent: false, reason: "STOP is engaged. Nothing was sent." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await ctx.runMutation(internal.emails.record, {
      ...baseEmail(args),
      status: "blocked" as const,
      error: "RESEND_API_KEY is not set.",
    });
    return {
      sent: false,
      reason:
        "RESEND_API_KEY is not set in Convex, so nothing can be sent. The draft is saved — see SETUP.md.",
    };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        reply_to: args.replyTo,
        subject: args.subject,
        text: args.body,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      await ctx.runMutation(internal.emails.record, {
        ...baseEmail(args),
        status: "failed" as const,
        error: `Resend ${res.status}: ${detail.slice(0, 300)}`,
      });
      return { sent: false, reason: `Resend rejected it (${res.status}). Logged, not sent.` };
    }

    const data = (await res.json()) as { id?: string };
    await ctx.runMutation(internal.emails.record, {
      ...baseEmail(args),
      status: "sent" as const,
      providerId: data.id,
      sentAt: Date.now(),
    });
    return { sent: true, reason: `Sent to ${args.to}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.emails.record, {
      ...baseEmail(args),
      status: "failed" as const,
      error: message,
    });
    return { sent: false, reason: `Send failed: ${message}` };
  }
}

function baseEmail(args: {
  botKey: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  bodySkeleton: string;
  leadId?: string;
  clientId?: string;
  sequenceStep?: number;
}) {
  return {
    botKey: args.botKey,
    direction: "out" as const,
    to: args.to,
    from: args.from,
    subject: args.subject,
    body: args.body,
    bodySkeleton: args.bodySkeleton,
    leadId: args.leadId as never,
    clientId: args.clientId as never,
    sequenceStep: args.sequenceStep,
  };
}

async function recordBlocked(
  ctx: ActionCtx,
  args: {
    botKey: string;
    to: string;
    subject: string;
    body: string;
    leadId?: string;
    clientId?: string;
    sequenceStep?: number;
  },
  why: string,
): Promise<void> {
  // A blocked email is still a full record. "Every send is logged with the full
  // text" has to include the ones that did not go.
  await ctx.runMutation(internal.emails.record, {
    botKey: args.botKey,
    direction: "out" as const,
    to: args.to,
    from: "(not sent)",
    subject: args.subject,
    body: args.body,
    leadId: args.leadId as never,
    clientId: args.clientId as never,
    sequenceStep: args.sequenceStep,
    status: "blocked" as const,
    error: why,
  });
}

/** Exposed for the Settings screen's "send yourself a test" button. */
export const sendTest = action({
  args: { to: v.string() },
  handler: async (ctx, { to }): Promise<SendOutcome> =>
    await ctx.runAction(internal.outbound.sendEmail, {
      botKey: "clientsuccess",
      to,
      subject: "test from the office",
      body: "If you are reading this, Resend is wired up correctly and the sender domain is verified.\n\nNothing else about this message means anything.",
      countsAgainstCap: false,
      personalisation: [],
    }),
});
