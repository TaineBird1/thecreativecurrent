import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { sendOutreachEmail } from "./_lib/email.js";
import { getSendBudget, sleep, SEND_GAP_MS } from "./_lib/sendGuard.js";
import type { Prospect, ProspectBulkSendApiResponse } from "../src/lib/prospects.js";

// Raised from the default because each Gmail SMTP send takes roughly four
// seconds and a batch is paced on top of that. MAX_PER_BATCH in sendGuard is
// sized to finish inside this window -- a function killed mid-batch would
// leave some prospects marked sent and others silently not.
export const config = { maxDuration: 60 };

// Used by the daily review page: unlike prospects-send.ts (which requires a
// prior "approved" status), this doesn't -- seeing the draft in the review
// checklist and clicking "Send selected" IS the human approval step here.
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

  // Budget is spent on sends that actually happen, not on ids submitted -- a
  // prospect skipped for having no email must not consume someone else's slot.
  const budget = await getSendBudget(ids.length);

  for (const id of ids) {
    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !prospect) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    const p = prospect as Prospect;
    if (p.status === "sent") {
      skipped.push({ id, reason: "already sent" });
      continue;
    }
    if (!p.email) {
      skipped.push({ id, reason: "no email on file" });
      continue;
    }
    if (!p.draft_subject || !p.draft_body) {
      skipped.push({ id, reason: "no draft" });
      continue;
    }

    if (sent.length >= budget.allowed) {
      skipped.push({ id, reason: budget.limitReason ?? "send limit reached" });
      continue;
    }

    try {
      if (sent.length > 0) await sleep(SEND_GAP_MS);
      await sendOutreachEmail(p.email, p.draft_subject, p.draft_body, { prospectId: p.id });
      await supabase.from("prospects").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
      sent.push(id);
    } catch (e) {
      skipped.push({ id, reason: e instanceof Error ? e.message : "send failed" });
    }
  }

  res.status(200).json({ ok: true, sent, skipped } satisfies ProspectBulkSendApiResponse);
}
