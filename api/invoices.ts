import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/db.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { sendInvoiceEmail, sendInvoiceReadyNotification, sendInvoiceReminderEmail } from "./_lib/email.js";
import type {
  Invoice,
  InvoiceActionApiResponse,
  InvoiceGenerateApiResponse,
  PublicInvoiceApiResponse,
} from "../src/lib/invoices.js";

// Three unrelated jobs share this one file rather than getting one each --
// the Hobby plan's 12-serverless-function cap (see CLAUDE.md) meant freeing
// a slot (merging invite-admin.ts/remove-admin.ts into api/staff.ts) rather
// than adding three new files for generation, sending, and the public view.
//
// Never sends a customer anything on its own: generation only ever produces
// a 'pending_approval' row, and both the cron and the "Generate now" button
// hit the exact same generateDueInvoices() so there's one source of truth
// for eligibility. An admin has to explicitly click Send per invoice.
async function generateDueInvoices() {
  const sql = getDb();
  const today = new Date();
  const day = today.getUTCDate();

  const customers = await sql<
    { id: number; business_name: string; contact_email: string; retainer_amount: string; retainer_currency: string }[]
  >`
    SELECT id, business_name, contact_email, retainer_amount, retainer_currency
    FROM customers
    WHERE billing_active = true AND billing_day = ${day} AND retainer_amount IS NOT NULL
  `;

  const created: { businessName: string; amount: number; currency: string }[] = [];

  for (const c of customers) {
    // One invoice per customer per calendar month -- re-running generation
    // (the cron already ran today, or "Generate now" clicked twice) must
    // never create a duplicate for the same billing period.
    const [existing] = await sql`
      SELECT id FROM invoices
      WHERE customer_id = ${c.id} AND date_trunc('month', created_at) = date_trunc('month', now())
    `;
    if (existing) continue;

    const [{ nextval }] = await sql<{ nextval: string }[]>`SELECT nextval('invoice_number_seq') AS nextval`;
    const invoiceNumber = `INV-${today.getUTCFullYear()}-${String(nextval).padStart(4, "0")}`;
    const periodLabel = today.toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
    const dueDate = today.toISOString().slice(0, 10);

    await sql`
      INSERT INTO invoices (customer_id, invoice_number, amount, currency, period_label, due_date)
      VALUES (${c.id}, ${invoiceNumber}, ${c.retainer_amount}, ${c.retainer_currency}, ${periodLabel}, ${dueDate})
    `;

    created.push({ businessName: c.business_name, amount: Number(c.retainer_amount), currency: c.retainer_currency });
  }

  return created;
}

async function runGeneration(res: VercelResponse) {
  const created = await generateDueInvoices();
  if (created.length > 0) {
    // Best-effort: a failed notification email must never fail the
    // generation response -- the invoices are already safely in the DB.
    try {
      await sendInvoiceReadyNotification(created);
    } catch (e) {
      console.error("Failed to send invoice-ready notification:", e);
    }
  }
  res.status(200).json({
    ok: true,
    created: created.length,
    customers: created.map((c) => c.businessName),
  } satisfies InvoiceGenerateApiResponse);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Public, no-auth branch: the invoice's own view_token is the access
    // control (same "unguessable UUID substitutes for auth on one public
    // resource" pattern as customers.tracking_site_key) -- invoice_number
    // is sequential and guessable, this isn't. A wrong id/token pair 404s
    // rather than returning a validation error, so a bad guess can never
    // confirm an invoice exists.
    if (typeof req.query.view === "string") {
      const id = Number(req.query.view);
      const token = typeof req.query.t === "string" ? req.query.t : undefined;
      if (!id || !token) {
        res.status(404).json({ ok: false, error: "not_found" } satisfies PublicInvoiceApiResponse);
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*, customers(business_name)")
        .eq("id", id)
        .eq("view_token", token)
        .maybeSingle();

      if (!invoice) {
        res.status(404).json({ ok: false, error: "not_found" } satisfies PublicInvoiceApiResponse);
        return;
      }

      const customer = invoice.customers as { business_name: string } | null;
      res.status(200).json({
        ok: true,
        invoice: {
          invoiceNumber: invoice.invoice_number,
          amount: Number(invoice.amount),
          currency: invoice.currency,
          periodLabel: invoice.period_label,
          dueDate: invoice.due_date,
          status: invoice.status,
          businessName: customer?.business_name ?? "",
          bankDetails: process.env.INVOICE_BANK_DETAILS?.trim() || null,
        },
      } satisfies PublicInvoiceApiResponse);
      return;
    }

    // Cron branch -- Vercel Cron doesn't verify CRON_SECRET for you.
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ ok: false, error: "unauthorized" } satisfies InvoiceGenerateApiResponse);
      return;
    }
    await runGeneration(res);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies InvoiceGenerateApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies InvoiceGenerateApiResponse);
    return;
  }

  const body = (req.body ?? {}) as { action?: string; id?: number };

  if (body.action === "generateNow") {
    await runGeneration(res);
    return;
  }

  if (body.action === "send" || body.action === "remind") {
    const id = body.id;
    if (!id) {
      res.status(400).json({ ok: false, error: "id is required" } satisfies InvoiceActionApiResponse);
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("invoices")
      .select("*, customers(business_name, contact_email)")
      .eq("id", id)
      .maybeSingle();

    const customer = row?.customers as { business_name: string; contact_email: string } | null;
    if (!row || !customer) {
      res.status(404).json({ ok: false, error: "not_found" } satisfies InvoiceActionApiResponse);
      return;
    }

    const invoice: Invoice = { ...row, amount: Number(row.amount) };

    try {
      if (body.action === "send") {
        await sendInvoiceEmail(invoice, customer);
        const { data: updated } = await supabase
          .from("invoices")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single();
        res.status(200).json({ ok: true, invoice: { ...updated, amount: Number(updated.amount) } } satisfies InvoiceActionApiResponse);
        return;
      }

      // remind: only meaningful on an already-sent, unpaid invoice.
      if (invoice.status !== "sent" || invoice.paid_at) {
        res.status(400).json({ ok: false, error: "invoice is not outstanding" } satisfies InvoiceActionApiResponse);
        return;
      }
      await sendInvoiceReminderEmail(invoice, customer);
      const { data: updated } = await supabase
        .from("invoices")
        .update({ reminder_count: invoice.reminder_count + 1, last_reminded_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      res.status(200).json({ ok: true, invoice: { ...updated, amount: Number(updated.amount) } } satisfies InvoiceActionApiResponse);
    } catch (e) {
      res.status(502).json({
        ok: false,
        error: e instanceof Error ? e.message : "send failed",
      } satisfies InvoiceActionApiResponse);
    }
    return;
  }

  res.status(400).json({ ok: false, error: "unknown_action" } satisfies InvoiceActionApiResponse);
}
