import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useSEO } from "../../lib/seo";
import type { PublicInvoiceApiResponse } from "../../lib/invoices";

type ViewState = { status: "loading" } | { status: "error" } | { status: "ok"; invoice: Extract<PublicInvoiceApiResponse, { ok: true }>["invoice"] };

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Public, no login required -- linked directly from the invoice email. The
// invoice's own view_token is the access control (see api/invoices.ts).
// Deliberately plain and print-friendly, independent of both the dark
// marketing theme and the admin's light theme: an invoice is a document
// customers may print or save as a PDF, not a brand surface.
export function Invoice() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("t");
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useSEO({ title: "Invoice | The Creative Current", description: "View your invoice from The Creative Current.", noindex: true });

  useEffect(() => {
    async function load() {
      if (!id || !token) {
        setState({ status: "error" });
        return;
      }
      try {
        const res = await fetch(`/api/invoices?view=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`);
        const data: PublicInvoiceApiResponse = await res.json();
        if (!data.ok) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ok", invoice: data.invoice });
      } catch {
        setState({ status: "error" });
      }
    }
    load();
  }, [id, token]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-gray-500">
        <p>Loading…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-gray-500">
        <p>This invoice link is invalid or has expired. Please contact The Creative Current if you need a copy.</p>
      </div>
    );
  }

  const { invoice } = state;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-10 shadow-sm">
        <div className="flex items-start justify-between border-b border-gray-200 pb-6">
          <div>
            <p className="text-lg font-bold text-gray-900">The Creative Current</p>
            <p className="mt-1 text-sm text-gray-500">Durban, KZN, South Africa</p>
            <p className="text-sm text-gray-500">thecreativecurrent01@gmail.com</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Invoice</p>
            <p className="mt-1 font-mono text-sm text-gray-900">{invoice.invoiceNumber}</p>
            {invoice.status === "paid" && (
              <p className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                PAID
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Billed to</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{invoice.businessName}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-gray-400">Due date</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {new Date(invoice.dueDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        <table className="w-full border-t border-gray-200 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="py-3 font-medium">Description</th>
              <th className="py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="py-4 text-gray-900">{invoice.periodLabel ? `Retainer — ${invoice.periodLabel}` : "Retainer"}</td>
              <td className="py-4 text-right font-mono text-gray-900">{formatMoney(invoice.amount, invoice.currency)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end border-t border-gray-200 py-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-gray-500">Total</span>
            <span className="font-mono text-xl font-bold text-gray-900">{formatMoney(invoice.amount, invoice.currency)}</span>
          </div>
        </div>

        {invoice.bankDetails && (
          <div className="mt-6 rounded-lg bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment details</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{invoice.bankDetails}</p>
          </div>
        )}
      </div>
    </div>
  );
}
