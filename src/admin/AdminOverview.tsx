import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { StatCard } from "./components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { LiveVisitorCount } from "../components/LiveVisitorCount";
import { TrafficChart } from "../components/TrafficChart";
import { IconUsers, IconClipboardList, IconInbox, IconActivity, IconSearch } from "./components/icons";
import type { LeadRow } from "../lib/leads";
import type { ChangeRequestStatus } from "../lib/changeRequests";
import { prospectStatusTone, type Prospect } from "../lib/prospects";

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

export function AdminOverview() {
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null);
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [newLeadCount, setNewLeadCount] = useState<number | null>(null);
  const [recentLeads, setRecentLeads] = useState<LeadRow[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentChangeRequest[]>([]);
  const [prospectCount, setProspectCount] = useState<number | null>(null);
  const [readyToSendCount, setReadyToSendCount] = useState<number | null>(null);
  const [recentProspects, setRecentProspects] = useState<Prospect[]>([]);
  const [ownSiteId, setOwnSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        { count: customers },
        { count: openRequests },
        { count: leads },
        { count: newLeads },
        { data: leadRows },
        { data: requestRows },
        { data: ownSite },
        { count: prospects },
        { count: readyToSend },
        { data: prospectRows },
      ] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }).neq("status", "internal"),
        supabase.from("change_requests").select("*", { count: "exact", head: true }).in("status", ["submitted", "in_progress"]),
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(5),
        supabase
          .from("change_requests")
          .select("id, description, status, created_at, customers(business_name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("customers").select("id").eq("status", "internal").maybeSingle(),
        supabase.from("prospects").select("*", { count: "exact", head: true }),
        supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("prospects").select("*").order("created_at", { ascending: false }).limit(5),
      ]);

      setCustomerCount(customers ?? 0);
      setOpenRequestCount(openRequests ?? 0);
      setLeadCount(leads ?? 0);
      setNewLeadCount(newLeads ?? 0);
      setRecentLeads((leadRows as LeadRow[]) ?? []);
      setRecentRequests((requestRows as unknown as RecentChangeRequest[]) ?? []);
      setOwnSiteId((ownSite as { id: number } | null)?.id ?? null);
      setProspectCount(prospects ?? 0);
      setReadyToSendCount(readyToSend ?? 0);
      setRecentProspects((prospectRows as Prospect[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">A snapshot of leads, clients, and open work.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={loading ? "—" : (customerCount ?? 0)} icon={<IconUsers className="size-4" />} />
        <StatCard
          label="Open Requests"
          value={loading ? "—" : (openRequestCount ?? 0)}
          icon={<IconClipboardList className="size-4" />}
          hint="Submitted or in progress"
        />
        <StatCard label="Total Leads" value={loading ? "—" : (leadCount ?? 0)} icon={<IconInbox className="size-4" />} />
        <StatCard
          label="New Leads"
          value={loading ? "—" : (newLeadCount ?? 0)}
          icon={<IconActivity className="size-4" />}
          hint="Last 7 days"
        />
        <StatCard label="Prospects" value={loading ? "—" : (prospectCount ?? 0)} icon={<IconSearch className="size-4" />} />
        <StatCard
          label="Ready to Send"
          value={loading ? "—" : (readyToSendCount ?? 0)}
          icon={<IconActivity className="size-4" />}
          hint="Approved, awaiting send"
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
                  <StatusBadge
                    label={req.status.replace("_", " ")}
                    tone={changeRequestTone[req.status]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Outreach Prospects</h2>
          <Link to="/admin/outreach" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-border">
          {!loading && recentProspects.length === 0 && (
            <p className="px-6 py-6 text-sm text-muted-foreground">
              No prospects yet — find some on the Outreach page.
            </p>
          )}
          {recentProspects.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{p.business_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.category || "—"} {p.address ? `· ${p.address}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {p.phone && (
                  <a href={`tel:${p.phone}`} className="text-xs text-primary hover:underline">
                    Call
                  </a>
                )}
                {p.email && (
                  <a href={`mailto:${p.email}`} className="text-xs text-primary hover:underline">
                    Email
                  </a>
                )}
                <StatusBadge label={p.status} tone={prospectStatusTone[p.status]} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
