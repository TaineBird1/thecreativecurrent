import { Resend } from "resend";
import { getSupabaseAdmin } from "./supabaseAdmin.js";
import type { LeadPayload } from "../../src/lib/leads.js";

let client: Resend | null = null;

export function getResend() {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    client = new Resend(apiKey);
  }
  return client;
}

const sourceLabels: Record<LeadPayload["source"], string> = {
  home: "Home page",
  pricing: "Pricing page",
  contact: "Contact page",
  appointment: "Appointment Booking page",
};

function buildBody(lead: LeadPayload, id?: number) {
  const rows: [string, string | undefined][] = [
    ["Source", sourceLabels[lead.source]],
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Service", lead.service_type],
    ["Company", lead.company_name],
    ["Start date", lead.start_date],
    ["Preferred date", lead.preferred_date],
    ["Newsletter opt-in", lead.newsletter === undefined ? undefined : lead.newsletter ? "Yes" : "No"],
    ["Message", lead.message],
    ["Description", lead.description],
    ["Project details", lead.project_details],
  ];

  const lines = rows
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([label, value]) => `${label}: ${value}`);

  if (id !== undefined) {
    lines.push("", `Lead ID: ${id}`);
  }

  return lines.join("\n");
}

// Best-effort: a logging failure must never mask the real send result or
// throw a different error than the caller expects, so failures here are
// swallowed (and reported to the function's own logs) rather than re-thrown.
async function logEmail(params: {
  recipient: string;
  subject: string;
  type: "outreach" | "lead_notification";
  status: "sent" | "failed";
  error?: string;
  prospectId?: number;
  leadId?: number;
}) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("email_log").insert({
      recipient: params.recipient,
      subject: params.subject,
      type: params.type,
      status: params.status,
      error: params.error ?? null,
      prospect_id: params.prospectId ?? null,
      lead_id: params.leadId ?? null,
    });
  } catch (e) {
    console.error("Failed to write email_log row:", e);
  }
}

export async function sendLeadNotification(lead: LeadPayload, id?: number) {
  const resend = getResend();
  const from = process.env.LEADS_FROM_EMAIL;
  const to = process.env.LEADS_NOTIFICATION_EMAIL;
  if (!from || !to) {
    throw new Error("LEADS_FROM_EMAIL or LEADS_NOTIFICATION_EMAIL is not set");
  }

  const subject = `New lead: ${lead.name} (${sourceLabels[lead.source]})`;

  // resend.emails.send() returns { data, error } -- it does NOT throw on a
  // rejected send, so this check is required or a failed send silently
  // looks like a success.
  const { error } = await resend.emails.send({
    from: `The Creative Current <${from}>`,
    to,
    subject,
    text: buildBody(lead, id),
  });
  if (error) {
    await logEmail({ recipient: to, subject, type: "lead_notification", status: "failed", error: error.message, leadId: id });
    throw new Error(error.message);
  }
  await logEmail({ recipient: to, subject, type: "lead_notification", status: "sent", leadId: id });
}

// Cold outreach: nothing calls this until a human has explicitly approved
// the exact draft being sent (see api/prospects-send.ts). Includes an
// opt-out line per POPIA's direct-marketing provisions.
export async function sendOutreachEmail(
  to: string,
  subject: string,
  body: string,
  opts: { prospectId?: number } = {}
) {
  const resend = getResend();
  const from = process.env.OUTREACH_FROM_EMAIL;
  if (!from) {
    throw new Error("OUTREACH_FROM_EMAIL is not set");
  }

  const { error } = await resend.emails.send({
    from: `The Creative Current <${from}>`,
    to,
    subject,
    text: body,
    html: `${body.replace(/\n/g, "<br>")}<br><br><hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">
      <p style="font-size:12px;color:#888;">The Creative Current, Durban, KZN, South Africa.
      If you'd rather not hear from us again, just reply and let us know.</p>`,
  });
  if (error) {
    await logEmail({ recipient: to, subject, type: "outreach", status: "failed", error: error.message, prospectId: opts.prospectId });
    throw new Error(error.message);
  }
  await logEmail({ recipient: to, subject, type: "outreach", status: "sent", prospectId: opts.prospectId });
}
