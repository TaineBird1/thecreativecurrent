import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  abandonedLeadPayloadSchema,
  leadPayloadSchema,
  type AbandonedLeadApiResponse,
  type LeadApiResponse,
} from "../src/lib/leads.js";
import { getDb } from "./_lib/db.js";
import { sendAbandonedLeadNotification, sendLeadNotification } from "./_lib/email.js";

// A real submission is well past the point of any abandoned-draft row for
// the same person still being useful -- they finished the thing the
// abandoned capture exists to catch. Deleting it here (rather than, say,
// marking it converted) keeps the abandoned list showing only people who
// genuinely still need a human to reach out.
async function clearAbandonedFor(email: string) {
  try {
    const sql = getDb();
    await sql`DELETE FROM abandoned_leads WHERE email = ${email} AND contacted_at IS NULL`;
  } catch (e) {
    console.error("Failed to clear abandoned_leads on real submit:", e);
  }
}

// Inquiry.tsx calls this in the background (debounced, plus once on
// page-hide) once someone has typed a real name/email/phone but before they
// hit the final Submit. Distinct from the real-lead insert below: this is
// speculative, still-changing input, so a repeat call for the same person
// within the window updates the existing draft row instead of piling up
// duplicates, and only the very first capture sends a notification --
// otherwise every debounce tick while they keep typing would fire an email.
const ABANDONED_DEDUPE_WINDOW_HOURS = 6;

async function handleAbandoned(req: VercelRequest, res: VercelResponse) {
  const parsed = abandonedLeadPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "validation_error" } satisfies AbandonedLeadApiResponse);
    return;
  }

  const draft = parsed.data;
  if (draft.honeypot) {
    res.status(201).json({ ok: true } satisfies AbandonedLeadApiResponse);
    return;
  }

  try {
    const sql = getDb();
    const cutoff = new Date(Date.now() - ABANDONED_DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const [existing] = await sql`
      SELECT id FROM abandoned_leads
      WHERE email = ${draft.email} AND contacted_at IS NULL AND created_at > ${cutoff}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existing) {
      await sql`
        UPDATE abandoned_leads SET
          source = ${draft.source}, name = ${draft.name}, phone = ${draft.phone ?? null},
          company_name = ${draft.company_name ?? null}, service_type = ${draft.service_type ?? null},
          project_details = ${draft.project_details ?? null}, preferred_date = ${draft.preferred_date ?? null},
          step_reached = ${draft.step_reached ?? 2}, updated_at = now()
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO abandoned_leads (
          source, name, email, phone, company_name, service_type,
          project_details, preferred_date, step_reached
        ) VALUES (
          ${draft.source}, ${draft.name}, ${draft.email}, ${draft.phone ?? null},
          ${draft.company_name ?? null}, ${draft.service_type ?? null},
          ${draft.project_details ?? null}, ${draft.preferred_date ?? null}, ${draft.step_reached ?? 2}
        )
      `;
      try {
        await sendAbandonedLeadNotification(draft);
      } catch (emailError) {
        console.error("Abandoned lead notification email failed:", emailError);
      }
    }

    res.status(201).json({ ok: true } satisfies AbandonedLeadApiResponse);
  } catch (dbError) {
    console.error("Abandoned lead capture failed:", dbError);
    res.status(500).json({ ok: false, error: "server_error" } satisfies AbandonedLeadApiResponse);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies LeadApiResponse);
    return;
  }

  if ((req.body as { abandoned?: boolean } | undefined)?.abandoned) {
    await handleAbandoned(req, res);
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

    await clearAbandonedFor(lead.email);

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
