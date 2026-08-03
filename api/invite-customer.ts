import type { VercelRequest, VercelResponse } from "@vercel/node";
import { inviteCustomerSchema, type InviteCustomerApiResponse } from "../src/lib/customers.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdmin } from "./_lib/requireAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies InviteCustomerApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies InviteCustomerApiResponse);
    return;
  }

  const supabase = getSupabaseAdmin();

  const parsed = inviteCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: "validation_error",
      issues: parsed.error.flatten(),
    } satisfies InviteCustomerApiResponse);
    return;
  }

  const payload = parsed.data;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    payload.contact_email
  );
  if (inviteError || !invited.user) {
    res.status(400).json({
      ok: false,
      error: inviteError?.message ?? "invite_failed",
    } satisfies InviteCustomerApiResponse);
    return;
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      business_name: payload.business_name,
      contact_name: payload.contact_name ?? null,
      contact_email: payload.contact_email,
      website_url: payload.website_url ?? null,
      lead_id: payload.lead_id ?? null,
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    res.status(500).json({
      ok: false,
      error: customerError?.message ?? "customer_insert_failed",
    } satisfies InviteCustomerApiResponse);
    return;
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: invited.user.id,
    email: payload.contact_email,
    role: "customer",
    customer_id: customer.id,
  });

  if (profileError) {
    res.status(500).json({ ok: false, error: profileError.message } satisfies InviteCustomerApiResponse);
    return;
  }

  res.status(201).json({ ok: true, customer_id: customer.id } satisfies InviteCustomerApiResponse);
}
