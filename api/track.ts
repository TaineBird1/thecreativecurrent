import type { VercelRequest, VercelResponse } from "@vercel/node";
import { trackEventSchema } from "../src/lib/analytics.js";
import { getDb } from "./_lib/db.js";

function setCorsHeaders(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const parsed = trackEventSchema.safeParse(req.body);
  if (!parsed.success) {
    // Public endpoint -- drop malformed payloads silently rather than
    // leaking validation details to whoever/whatever is calling it.
    res.status(204).end();
    return;
  }

  const event = parsed.data;

  try {
    const sql = getDb();
    const [customer] = await sql`
      SELECT id FROM customers WHERE tracking_site_key = ${event.site_key} AND status = 'active'
    `;

    if (!customer) {
      // Unknown/inactive site key -- drop silently, don't reveal validity.
      res.status(204).end();
      return;
    }

    await sql`
      INSERT INTO analytics_events (customer_id, visitor_id, event_type, page_path, referrer)
      VALUES (${customer.id}, ${event.visitor_id}, ${event.event_type}, ${event.page_path ?? null}, ${event.referrer ?? null})
    `;

    res.status(204).end();
  } catch (err) {
    console.error("Track event failed:", err);
    res.status(204).end();
  }
}
