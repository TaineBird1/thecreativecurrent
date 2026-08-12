export const invoiceStatuses = ["pending_approval", "sent", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceStatusTone: Record<InvoiceStatus, "neutral" | "primary" | "success" | "warning"> = {
  pending_approval: "warning",
  sent: "primary",
  paid: "success",
  cancelled: "neutral",
};

export type Invoice = {
  id: number;
  customer_id: number;
  invoice_number: string;
  amount: number;
  currency: string;
  period_label: string | null;
  status: InvoiceStatus;
  due_date: string;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  view_token: string;
  reminder_count: number;
  last_reminded_at: string | null;
  created_at: string;
};

export type InvoiceWithCustomer = Invoice & {
  customers: { business_name: string; contact_email: string } | null;
};

/**
 * No 'overdue' status is stored on the row -- computed here instead, so the
 * admin list and any other reader can never disagree with the DB about what
 * "overdue" means. Only a sent, unpaid invoice past its due date qualifies.
 */
export function isInvoiceOverdue(invoice: Invoice): boolean {
  if (invoice.status !== "sent") return false;
  if (invoice.paid_at) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(invoice.due_date) < today;
}

export type InvoiceGenerateApiResponse =
  | { ok: true; created: number; customers: string[] }
  | { ok: false; error: string };

export type InvoiceActionApiResponse = { ok: true; invoice: Invoice } | { ok: false; error: string };

/** api/invoices.ts's public `?view=&t=` branch -- a computed payload, not a raw row, so camelCase like ProspectSearchResult. */
export type PublicInvoiceApiResponse =
  | {
      ok: true;
      invoice: {
        invoiceNumber: string;
        amount: number;
        currency: string;
        periodLabel: string | null;
        dueDate: string;
        status: InvoiceStatus;
        businessName: string;
        bankDetails: string | null;
      };
    }
  | { ok: false; error: string };
