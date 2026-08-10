import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { sendOutreachReply } from "./_lib/email.js";
import type { Prospect, ProspectSendReplyApiResponse } from "../src/lib/prospects.js";

// Admin-only: sends a reply to a prospect who wrote back. Body { id, body }
// -- `body` is whatever's currently in the admin's edit box (the AI
// suggestion, possibly rewritten, or something written from scratch), never
// re-derived from ai_suggested_reply server-side. This is the same
// explicit-approval shape as prospects-send.ts: nothing goes out on a
// suggestion alone.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectSendReplyApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectSendReplyApiResponse);
    return;
  }

  const { id, body } = (req.body ?? {}) as { id?: number; body?: string };
  if (!id || !body?.trim()) {
    res.status(400).json({ ok: false, error: "id and body are required" } satisfies ProspectSendReplyApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: prospect, error: fetchError } = await supabase.from("prospects").select("*").eq("id", id).single();
  if (fetchError || !prospect) {
    res.status(404).json({ ok: false, error: "not found" } satisfies ProspectSendReplyApiResponse);
    return;
  }
  const p = prospect as Prospect;

  if (!p.email) {
    res.status(400).json({ ok: false, error: "This prospect has no email address on file" } satisfies ProspectSendReplyApiResponse);
    return;
  }

  const subject = p.draft_subject ? `Re: ${p.draft_subject.replace(/^Re:\s*/i, "")}` : `Re: ${p.business_name}`;

  try {
    await sendOutreachReply(p.email, subject, body, { prospectId: p.id, inReplyTo: p.reply_message_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "send failed" } satisfies ProspectSendReplyApiResponse);
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("prospects")
    .update({ reply_sent_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updated) {
    res.status(500).json({ ok: false, error: updateError?.message ?? "status update failed" } satisfies ProspectSendReplyApiResponse);
    return;
  }

  res.status(200).json({ ok: true, prospect: updated as Prospect } satisfies ProspectSendReplyApiResponse);
}
