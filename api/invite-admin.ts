import type { VercelRequest, VercelResponse } from "@vercel/node";
import { inviteStaffSchema, type InviteStaffApiResponse } from "../src/lib/staff.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireOwner } from "./_lib/requireOwner.js";

// Owner-only: invites a new staff admin. Distinct from invite-customer.ts --
// this creates a profiles row with role='admin' and no customer_id, giving
// full day-to-day admin access but not the ability to invite/remove other
// admins (that stays owner-only, see requireOwner.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies InviteStaffApiResponse);
    return;
  }

  const auth = await requireOwner(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies InviteStaffApiResponse);
    return;
  }

  const parsed = inviteStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: "validation_error",
      issues: parsed.error.flatten(),
    } satisfies InviteStaffApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();
  const { email } = parsed.data;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited.user) {
    res.status(400).json({
      ok: false,
      error: inviteError?.message ?? "invite_failed",
    } satisfies InviteStaffApiResponse);
    return;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: invited.user.id,
    email,
    role: "admin",
  });

  if (profileError) {
    res.status(500).json({ ok: false, error: profileError.message } satisfies InviteStaffApiResponse);
    return;
  }

  res.status(201).json({ ok: true } satisfies InviteStaffApiResponse);
}
