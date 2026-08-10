import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { RemoveStaffApiResponse } from "../src/lib/staff.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireOwner } from "./_lib/requireOwner.js";

// Owner-only: revokes a staff admin's access entirely (deletes their auth
// user, which cascades the profiles row via ON DELETE CASCADE) rather than
// just changing their role, so a removed admin can't sign back in at all.
// Refuses to touch an 'owner' row -- this endpoint is for managing staff,
// not for owners removing each other or themselves by mistake.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies RemoveStaffApiResponse);
    return;
  }

  const auth = await requireOwner(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies RemoveStaffApiResponse);
    return;
  }

  const { id } = (req.body ?? {}) as { id?: string };
  if (!id) {
    res.status(400).json({ ok: false, error: "id is required" } satisfies RemoveStaffApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();

  if (fetchError || !profile) {
    res.status(404).json({ ok: false, error: "not found" } satisfies RemoveStaffApiResponse);
    return;
  }
  if (profile.role !== "admin") {
    res.status(400).json({ ok: false, error: "can only remove admin staff" } satisfies RemoveStaffApiResponse);
    return;
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
  if (deleteError) {
    res.status(500).json({ ok: false, error: deleteError.message } satisfies RemoveStaffApiResponse);
    return;
  }

  res.status(200).json({ ok: true } satisfies RemoveStaffApiResponse);
}
