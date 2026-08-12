import type { VercelRequest, VercelResponse } from "@vercel/node";
import { inviteStaffSchema, type InviteStaffApiResponse, type RemoveStaffApiResponse } from "../src/lib/staff.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireOwner } from "./_lib/requireOwner.js";

// Owner-only staff management. Merges what were two separate files
// (invite-admin.ts, remove-admin.ts) into one, branched on `action` --
// freed a slot under the Hobby plan's 12-serverless-function cap for the
// invoicing feature. Both actions are unchanged from their original files.
type StaffAction =
  | { action: "invite"; email: string }
  | { action: "remove"; id: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const auth = await requireOwner(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error });
    return;
  }

  const body = (req.body ?? {}) as Partial<StaffAction>;
  const supabase = getSupabaseAdmin();

  if (body.action === "invite") {
    const parsed = inviteStaffSchema.safeParse({ email: body.email });
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "validation_error",
        issues: parsed.error.flatten(),
      } satisfies InviteStaffApiResponse);
      return;
    }
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
    return;
  }

  if (body.action === "remove") {
    const { id } = body;
    if (!id) {
      res.status(400).json({ ok: false, error: "id is required" } satisfies RemoveStaffApiResponse);
      return;
    }

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
    return;
  }

  res.status(400).json({ ok: false, error: "unknown_action" });
}
