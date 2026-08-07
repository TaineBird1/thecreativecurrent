import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { sendOutreachEmail } from "./_lib/email.js";
import { getSendBudget, MAX_PER_DAY } from "./_lib/sendGuard.js";
import type { Prospect, ProspectSendApiResponse } from "../src/lib/prospects.js";

// Deliberately requires status === "approved" -- nothing sends without a
// human explicitly approving that exact draft first.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectSendApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectSendApiResponse);
    return;
  }

  const { id } = (req.body ?? {}) as { id?: number };
  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" } satisfies ProspectSendApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: prospect, error: fetchError } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !prospect) {
    res.status(404).json({ ok: false, error: "not found" } satisfies ProspectSendApiResponse);
    return;
  }

  if (!prospect.email) {
    res.status(400).json({ ok: false, error: "This prospect has no email address on file" } satisfies ProspectSendApiResponse);
    return;
  }
  if (prospect.status !== "approved") {
    res.status(400).json({ ok: false, error: "Approve this draft before sending" } satisfies ProspectSendApiResponse);
    return;
  }
  if (!prospect.draft_subject || !prospect.draft_body) {
    res.status(400).json({ ok: false, error: "No draft to send" } satisfies ProspectSendApiResponse);
    return;
  }

  // One-at-a-time sends draw on the same daily budget as the bulk paths.
  // Without this the cap would be trivially bypassed by clicking send on
  // individual prospects instead of using the review page.
  const budget = await getSendBudget(1);
  if (budget.allowed < 1) {
    res.status(429).json({
      ok: false,
      error: `Daily send limit reached — ${budget.sentToday} of ${MAX_PER_DAY} sent in the last 24 hours. Try again later.`,
    } satisfies ProspectSendApiResponse);
    return;
  }

  try {
    await sendOutreachEmail(prospect.email, prospect.draft_subject, prospect.draft_body, { prospectId: prospect.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "send failed" } satisfies ProspectSendApiResponse);
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("prospects")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updated) {
    res.status(500).json({ ok: false, error: updateError?.message ?? "status update failed" } satisfies ProspectSendApiResponse);
    return;
  }

  res.status(200).json({ ok: true, prospect: updated as Prospect } satisfies ProspectSendApiResponse);
}
