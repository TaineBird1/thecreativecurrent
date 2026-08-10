import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { generateAiOpening } from "./_lib/aiDraft.js";
import { buildOutreachDraft } from "../src/lib/outreachTemplate.js";
import type { Prospect, ProspectDraftApiResponse } from "../src/lib/prospects.js";

// Admin-only: (re)generates a prospect's draft with an AI-written opening,
// grounded in the same facts the rule-based template already used (the
// site's specific defect, category, no-website vs poor-website). Falls back
// to the deterministic opener if the AI call fails -- see
// generateAiOpening's own fallback contract -- so this can never leave a
// prospect stuck without a draft. This is the server-side replacement for
// ProspectCard.tsx's old client-side buildOutreachDraft() call, which had no
// way to reach an API key.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectDraftApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectDraftApiResponse);
    return;
  }

  const { id } = (req.body ?? {}) as { id?: number };
  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" } satisfies ProspectDraftApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: prospect, error: fetchError } = await supabase.from("prospects").select("*").eq("id", id).single();
  if (fetchError || !prospect) {
    res.status(404).json({ ok: false, error: "not found" } satisfies ProspectDraftApiResponse);
    return;
  }
  const p = prospect as Prospect;

  const opening = await generateAiOpening({
    businessName: p.business_name,
    category: p.category,
    reason: p.reason,
    emailDefect: p.email_defect,
    address: p.address,
  });

  const { subject, body } = buildOutreachDraft(p.business_name, p.category, p.reason, p.email_defect, opening);

  const { data: updated, error: updateError } = await supabase
    .from("prospects")
    .update({
      draft_subject: subject,
      draft_body: body,
      status: p.status === "new" ? "drafted" : p.status,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updated) {
    res.status(500).json({
      ok: false,
      error: updateError?.message ?? "update failed",
    } satisfies ProspectDraftApiResponse);
    return;
  }

  res.status(200).json({
    ok: true,
    prospect: updated as Prospect,
    aiGenerated: opening !== null,
  } satisfies ProspectDraftApiResponse);
}
