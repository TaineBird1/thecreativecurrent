import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { sendOutreachEmail } from "./_lib/email.js";
import { buildFollowUpDraft } from "../src/lib/outreachTemplate.js";
import { FOLLOW_UP_AFTER_DAYS, type Prospect, type ProspectBulkSendApiResponse } from "../src/lib/prospects.js";

// The single permitted second touch, sent from the review page in the same
// human-approved batch style as the first email.
//
// Every guard below is a refusal to send rather than a filter on a list. The
// review page already filters, but a stale tab, a double-click or a hand-built
// request must not be able to send a second follow-up to someone -- there is
// no unsending, and a business that has already had two unsolicited emails
// from us should never receive a third.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectBulkSendApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectBulkSendApiResponse);
    return;
  }

  const { ids } = (req.body ?? {}) as { ids?: number[] };
  if (!ids || ids.length === 0) {
    res.status(400).json({ ok: false, error: "ids is required" } satisfies ProspectBulkSendApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();
  const sent: number[] = [];
  const skipped: { id: number; reason: string }[] = [];
  const cutoff = Date.now() - FOLLOW_UP_AFTER_DAYS * 24 * 60 * 60 * 1000;

  for (const id of ids) {
    const { data: prospect, error: fetchError } = await supabase.from("prospects").select("*").eq("id", id).single();

    if (fetchError || !prospect) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    const p = prospect as Prospect;

    // Anything other than "sent" means either the first email never went out,
    // or the outcome is already known (replied/won/lost) -- following up on a
    // conversation that already happened is the worst version of this.
    if (p.status !== "sent") {
      skipped.push({ id, reason: `status is "${p.status}", not "sent"` });
      continue;
    }
    if (p.followed_up_at) {
      skipped.push({ id, reason: "already followed up once" });
      continue;
    }
    if (!p.email) {
      skipped.push({ id, reason: "no email on file" });
      continue;
    }
    if (!p.sent_at) {
      skipped.push({ id, reason: "no record of when the first email was sent" });
      continue;
    }
    if (new Date(p.sent_at).getTime() > cutoff) {
      skipped.push({ id, reason: `first email was less than ${FOLLOW_UP_AFTER_DAYS} days ago` });
      continue;
    }

    const { subject, body } = buildFollowUpDraft(p.business_name, p.category, p.email_defect);

    try {
      await sendOutreachEmail(p.email, subject, body, { prospectId: p.id });
      // Status deliberately stays "sent". A follow-up is a second attempt at
      // the same step, not progress through the funnel -- moving it would make
      // the reply-rate numbers on the stats page count one prospect twice.
      await supabase.from("prospects").update({ followed_up_at: new Date().toISOString() }).eq("id", id);
      sent.push(id);
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : "send failed" });
    }
  }

  res.status(200).json({ ok: true, sent, skipped } satisfies ProspectBulkSendApiResponse);
}
