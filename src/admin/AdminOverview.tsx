import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { StatCard } from "./components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { LiveVisitorCount } from "../components/LiveVisitorCount";
import { TrafficChart } from "../components/TrafficChart";
import { IconUsers, IconClipboardList, IconInbox, IconReceipt, IconTrendingUp } from "./components/icons";
import type { LeadRow } from "../lib/leads";
import type { ChangeRequestStatus } from "../lib/changeRequests";
import { isInvoiceOverdue, type InvoiceWithCustomer } from "../lib/invoices";

type RecentChangeRequest = {
  id: number;
  description: string;
  status: ChangeRequestStatus;
  created_at: string;
  customers: { business_name: string } | null;
};

const changeRequestTone: Record<ChangeRequestStatus, "neutral" | "primary" | "success"> = {
  submitted: "neutral",
  in_progress: "primary",
  done: "success",
};

function formatZAR(amount: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(
    amount
  );
}

export function AdminOverview() {
  const [mrr, setMrr] = useState<number | null>(null);
  const [invoicedThisMonth, setInvoicedThisMonth] = useState<number | null>(null);
  const [paidThisMonth, setPaidThisMonth] = useState<number | null>(null);
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceWithCustomer[]>([]);

  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  const [newLeadCount, setNewLeadCount] = useState<number | null>(null);
  const [recentLeads, setRecentLeads] = useState<LeadRow[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentChangeRequest[]>([]);
  const [ownSiteId, setOwnSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        { data: retainers },
        { data: invoicedRows },
        { data: paidRows },
        { data: outstandingRows },
        { data: overdueRows },
        { count: customers },
        { count: openRequests },
        { count: newLeads },
        { data: leadRows },
        { data: requestRows },
        { data: ownSite },
      ] = await Promise.all([
        supabase.from("customers").select("retainer_amount").eq("billing_active", true).not("retainer_amount", "is", null),
        supabase.from("invoices").select("amount").gte("created_at", monthStart.toISOString()),
        supabase.from("invoices").select("amount").gte("paid_at", monthStart.toISOString()).not("paid_at", "is", null),
        supabase.from("invoices").select("amount").eq("status", "sent").is("paid_at", null),
        supabase
          .from("invoices")
          .select("*, customers(business_name, contact_email)")
          .eq("status", "sent")
          .is("paid_at", null)
          .order("due_date", { ascending: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }).neq("status", "internal"),
        supabase.from("change_requests").select("*", { count: "exact", head: true }).in("status", ["submitted", "in_progress"]),
        supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(5),
        supabase
          .from("change_requests")
          .select("id, description, status, created_at, customers(business_name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("customers").select("id").eq("status", "internal").maybeSingle(),
      ]);

      const sum = (rows: { amount: number | string }[] | null) =>
        (rows ?? []).reduce((total, r) => total + Number(r.amount), 0);

      setMrr(sum(retainers as unknown as { amount: number | string }[]));
      setInvoicedThisMonth(sum(invoicedRows));
      setPaidThisMonth(sum(paidRows));
      setOutstanding(sum(outstandingRows));
      const overdue = ((overdueRows as InvoiceWithCustomer[]) ?? []).filter(isInvoiceOverdue);
      setOverdueInvoices(overdue);

      setCustomerCount(customers ?? 0);
      setOpenRequestCount(openRequests ?? 0);
      setNewLeadCount(newLeads ?? 0);
      setRecentLeads((leadRows as LeadRow[]) ?? []);
      setRecentRequests((requestRows as unknown as RecentChangeRequest[]) ?? []);
      setOwnSiteId((ownSite as { id: number } | null)?.id ?? null);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Income, retainers, and what needs attention.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={loading ? "—" : formatZAR(mrr ?? 0)}
          icon={<IconTrendingUp className="size-4" />}
          hint="Active retainers"
        />
        <StatCard
          label="Invoiced"
          value={loading ? "—" : formatZAR(invoicedThisMonth ?? 0)}
          icon={<IconReceipt className="size-4" />}
          hint="This month"
        />
        <StatCard
          label="Paid"
          value={loading ? "—" : formatZAR(paidThisMonth ?? 0)}
          icon={<IconReceipt className="size-4" />}
          hint="This month"
        />
        <StatCard
          label="Outstanding"
          value={loading ? "—" : formatZAR(outstanding ?? 0)}
          icon={<IconReceipt className="size-4" />}
          hint={`${overdueInvoices.length} overdue`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Overdue Invoices</h2>
          <Link to="/admin/invoicing" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-border">
          {!loading && overdueInvoices.length === 0 && (
            <p className="px-6 py-6 text-sm text-muted-foreground">Nothing overdue.</p>
          )}
          {overdueInvoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {inv.customers?.business_name ?? "—"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {inv.invoice_number} · due {new Date(inv.due_date).toLocaleDateString()}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm text-foreground">
                {formatZAR(Number(inv.amount))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Customers" value={loading ? "—" : (customerCount ?? 0)} icon={<IconUsers className="size-4" />} />
        <StatCard
          label="Open Requests"
          value={loading ? "—" : (openRequestCount ?? 0)}
          icon={<IconClipboardList className="size-4" />}
          hint="Submitted or in progress"
        />
        <StatCard
          label="New Leads"
          value={loading ? "—" : (newLeadCount ?? 0)}
          icon={<IconInbox className="size-4" />}
          hint="Last 7 days"
        />
      </div>

      {ownSiteId && (
        <div>
          <h2 className="mb-4 font-sans text-lg font-semibold">Your Website</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <LiveVisitorCount customerId={ownSiteId} />
            <div className="lg:col-span-2">
              <TrafficChart customerId={ownSiteId} />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-sans text-sm font-semibold">Recent Leads</h2>
            <Link to="/admin/leads" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {!loading && recentLeads.length === 0 && (
              <p className="px-6 py-6 text-sm text-muted-foreground">No leads yet.</p>
            )}
            {recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{lead.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {new Date(lead.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-sans text-sm font-semibold">Recent Change Requests</h2>
            <Link to="/admin/change-requests" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {!loading && recentRequests.length === 0 && (
              <p className="px-6 py-6 text-sm text-muted-foreground">No change requests yet.</p>
            )}
            {recentRequests.map((req) => (
              <div key={req.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {req.customers?.business_name && (
                      <p className="font-mono text-[10px] uppercase tracking-wide text-primary">
                        {req.customers.business_name}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-sm text-foreground">{req.description}</p>
                  </div>
                  <StatusBadge label={req.status.replace("_", " ")} tone={changeRequestTone[req.status]} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
