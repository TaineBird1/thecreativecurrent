import { Resend } from "resend";
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

export async function sendLeadNotification(lead: LeadPayload, id?: number) {
  const resend = getResend();
  const from = process.env.LEADS_FROM_EMAIL;
  const to = process.env.LEADS_NOTIFICATION_EMAIL;
  if (!from || !to) {
    throw new Error("LEADS_FROM_EMAIL or LEADS_NOTIFICATION_EMAIL is not set");
  }

  await resend.emails.send({
    from: `The Creative Current <${from}>`,
    to,
    subject: `New lead: ${lead.name} (${sourceLabels[lead.source]})`,
    text: buildBody(lead, id),
  });
}

// Cold outreach: nothing calls this until a human has explicitly approved
// the exact draft being sent (see api/prospects-send.ts). Includes an
// opt-out line per POPIA's direct-marketing provisions.
export async function sendOutreachEmail(to: string, subject: string, body: string) {
  const resend = getResend();
  const from = process.env.OUTREACH_FROM_EMAIL;
  if (!from) {
    throw new Error("OUTREACH_FROM_EMAIL is not set");
  }

  await resend.emails.send({
    from: `The Creative Current <${from}>`,
    to,
    subject,
    text: body,
    html: `${body.replace(/\n/g, "<br>")}<br><br><hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">
      <p style="font-size:12px;color:#888;">The Creative Current, Durban, KZN, South Africa.
      If you'd rather not hear from us again, just reply and let us know.</p>`,
  });
}
