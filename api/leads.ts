import type { VercelRequest, VercelResponse } from "@vercel/node";
import { leadPayloadSchema, type LeadApiResponse } from "../src/lib/leads.js";
import { getDb } from "./_lib/db.js";
import { sendLeadNotification } from "./_lib/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies LeadApiResponse);
    return;
  }

  const parsed = leadPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: "validation_error",
      issues: parsed.error.flatten(),
    } satisfies LeadApiResponse);
    return;
  }

  const lead = parsed.data;

  if (lead.honeypot) {
    res.status(201).json({ ok: true } satisfies LeadApiResponse);
    return;
  }

  try {
    const sql = getDb();
    // start_date/preferred_date are optional date inputs that submit as ""
    // when left blank, not omitted -- `??` only guards null/undefined, so
    // an empty string reached postgres as a literal DATE value and crashed
    // ("Invalid time value") on every submission that skipped these fields.
    const [row] = await sql`
      INSERT INTO leads (
        source, name, email, phone, service_type, message, description,
        project_details, start_date, preferred_date, company_name,
        newsletter_opt_in, raw_payload
      ) VALUES (
        ${lead.source}, ${lead.name}, ${lead.email}, ${lead.phone ?? null},
        ${lead.service_type ?? null}, ${lead.message ?? null}, ${lead.description ?? null},
        ${lead.project_details ?? null}, ${lead.start_date || null}, ${lead.preferred_date || null},
        ${lead.company_name ?? null}, ${lead.newsletter ?? null}, ${sql.json(lead)}
      )
      RETURNING id
    `;

    try {
      await sendLeadNotification(lead, row.id);
    } catch (emailError) {
      console.error("Lead notification email failed:", emailError);
    }

    res.status(201).json({ ok: true, id: row.id } satisfies LeadApiResponse);
  } catch (dbError) {
    console.error("Lead insert failed:", dbError);
    res.status(500).json({ ok: false, error: "server_error" } satisfies LeadApiResponse);
  }
}
