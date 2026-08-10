import type { VercelRequest } from "@vercel/node";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

export type RequireOwnerResult =
  | { authorized: true; userId: string }
  | { authorized: false; status: number; error: string };

// Stricter than requireAdmin.ts: only 'owner' passes, not 'admin'. Used by
// the staff-management endpoints (invite/remove an admin) so an invited
// admin can't turn around and invite or remove other admins themselves.
export async function requireOwner(req: VercelRequest): Promise<RequireOwnerResult> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) {
    return { authorized: false, status: 401, error: "missing_auth" };
  }

  const supabase = getSupabaseAdmin();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { authorized: false, status: 401, error: "invalid_auth" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "owner") {
    return { authorized: false, status: 403, error: "forbidden" };
  }

  return { authorized: true, userId: userData.user.id };
}
