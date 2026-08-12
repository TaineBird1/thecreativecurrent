import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge } from "../components/StatusBadge";
import { isInvoiceOverdue, invoiceStatusTone, type InvoiceActionApiResponse, type InvoiceGenerateApiResponse, type InvoiceWithCustomer } from "../lib/invoices";

function formatMoney(amount: number | string, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function toCsvRow(cells: (string | number)[]) {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

export function AdminInvoicing() {
  const [pending, setPending] = useState<InvoiceWithCustomer[]>([]);
  const [history, setHistory] = useState<InvoiceWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "generate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pendingRows }, { data: historyRows }] = await Promise.all([
      supabase
        .from("invoices")
        .select("*, customers(business_name, contact_email)")
        .eq("status", "pending_approval")
        .order("created_at", { ascending: true }),
      supabase
        .from("invoices")
        .select("*, customers(business_name, contact_email)")
        .neq("status", "pending_approval")
        .order("created_at", { ascending: false }),
    ]);
    setPending((pendingRows as InvoiceWithCustomer[]) ?? []);
    setHistory((historyRows as InvoiceWithCustomer[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function authedFetch(body: object) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    return fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async function generateNow() {
    setBusy("generate");
    setMessage(null);
    setError(null);
    try {
      const res = await authedFetch({ action: "generateNow" });
      const data: InvoiceGenerateApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setMessage(
        data.created === 0
          ? "Nothing due today."
          : `Generated ${data.created} invoice${data.created === 1 ? "" : "s"}: ${data.customers.join(", ")}.`
      );
      await load();
    } catch {
      setError("Something went wrong generating invoices.");
    } finally {
      setBusy(null);
    }
  }

  async function sendInvoice(id: number) {
    setBusy(id);
    setError(null);
    try {
      const res = await authedFetch({ action: "send", id });
      const data: InvoiceActionApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      await load();
    } catch {
      setError("Something went wrong sending this invoice.");
    } finally {
      setBusy(null);
    }
  }

  async function sendReminder(id: number) {
    setBusy(id);
    setError(null);
    try {
      const res = await authedFetch({ action: "remind", id });
      const data: InvoiceActionApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      await load();
    } catch {
      setError("Something went wrong sending the reminder.");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(id: number) {
    setBusy(id);
    setError(null);
    await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    setBusy(null);
    await load();
  }

  function exportCsv() {
    const rows = [...pending, ...history];
    const header = toCsvRow(["Invoice #", "Customer", "Amount", "Currency", "Status", "Due Date", "Sent At", "Paid At"]);
    const lines = rows.map((inv) =>
      toCsvRow([
        inv.invoice_number,
        inv.customers?.business_name ?? "",
        Number(inv.amount).toFixed(2),
        inv.currency,
        isInvoiceOverdue(inv) ? "overdue" : inv.status,
        inv.due_date,
        inv.sent_at ?? "",
        inv.paid_at ?? "",
      ])
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl font-bold">Invoicing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Retainer invoices draft automatically on each customer's billing day — nothing emails until you
            approve it here.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={pending.length === 0 && history.length === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={generateNow}
            disabled={busy === "generate"}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {busy === "generate" ? "Generating..." : "Generate now"}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-primary">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Pending Approval ({pending.length})</h2>
        </div>
        {loading ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Nothing waiting on you right now.</p>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{inv.customers?.business_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {inv.invoice_number} · {inv.period_label ?? "—"} · due {new Date(inv.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm text-foreground">{formatMoney(inv.amount, inv.currency)}</span>
                  <button
                    type="button"
                    onClick={() => sendInvoice(inv.id)}
                    disabled={busy === inv.id}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                  >
                    {busy === inv.id ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">History ({history.length})</h2>
        </div>
        {loading ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : history.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">No sent invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-6 py-3 font-medium">Customer</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Due</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((inv) => {
                  const overdue = isInvoiceOverdue(inv);
                  return (
                    <tr key={inv.id} className="transition-colors hover:bg-foreground/[0.03]">
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{inv.invoice_number}</td>
                      <td className="px-6 py-4 text-foreground">{inv.customers?.business_name ?? "—"}</td>
                      <td className="px-6 py-4 font-mono text-foreground">{formatMoney(inv.amount, inv.currency)}</td>
                      <td className="px-6 py-4">
                        {overdue ? (
                          <StatusBadge label="overdue" tone="warning" />
                        ) : (
                          <StatusBadge label={inv.status} tone={invoiceStatusTone[inv.status]} />
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {new Date(inv.due_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {overdue && (
                            <button
                              type="button"
                              onClick={() => sendReminder(inv.id)}
                              disabled={busy === inv.id}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                              title={
                                inv.last_reminded_at
                                  ? `Last reminded ${new Date(inv.last_reminded_at).toLocaleDateString()} (${inv.reminder_count}x)`
                                  : undefined
                              }
                            >
                              {busy === inv.id ? "Sending..." : inv.reminder_count > 0 ? "Remind again" : "Send reminder"}
                            </button>
                          )}
                          {inv.status === "sent" && (
                            <button
                              type="button"
                              onClick={() => markPaid(inv.id)}
                              disabled={busy === inv.id}
                              className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
                            >
                              Mark paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
