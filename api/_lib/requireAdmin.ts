import type { VercelRequest } from "@vercel/node";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

export type RequireAdminResult =
  | { authorized: true; userId: string }
  | { authorized: false; status: number; error: string };

export async function requireAdmin(req: VercelRequest): Promise<RequireAdminResult> {
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

  if (profile?.role !== "admin") {
    return { authorized: false, status: 403, error: "forbidden" };
  }

  return { authorized: true, userId: userData.user.id };
}
