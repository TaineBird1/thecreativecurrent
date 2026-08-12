import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { AbandonedLeadRow, LeadRow } from "../lib/leads";

const STEP_LABELS: Record<number, string> = {
  0: "Chose a service",
  1: "Picked a date",
  2: "Filled in their details",
  3: "Reviewed their own submission",
};

type Tab = "submitted" | "abandoned";

export function AdminLeads() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("submitted");

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [abandoned, setAbandoned] = useState<AbandonedLeadRow[]>([]);
  const [abandonedLoading, setAbandonedLoading] = useState(true);
  const [showAllAbandoned, setShowAllAbandoned] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setLeads((data as LeadRow[]) ?? []);
        setLeadsLoading(false);
      });
  }, []);

  const loadAbandoned = useCallback(async () => {
    setAbandonedLoading(true);
    let query = supabase.from("abandoned_leads").select("*").order("created_at", { ascending: false });
    if (!showAllAbandoned) query = query.is("contacted_at", null);
    const { data } = await query;
    setAbandoned((data as AbandonedLeadRow[]) ?? []);
    setAbandonedLoading(false);
  }, [showAllAbandoned]);

  useEffect(() => {
    loadAbandoned();
  }, [loadAbandoned]);

  function convertToCustomer(lead: LeadRow) {
    navigate("/admin/customers", {
      state: {
        prefill: {
          business_name: lead.company_name || lead.name,
          contact_name: lead.name,
          contact_email: lead.email,
          website_url: "",
        },
      },
    });
  }

  async function markContacted(row: AbandonedLeadRow) {
    setBusy(row.id);
    await supabase.from("abandoned_leads").update({ contacted_at: new Date().toISOString() }).eq("id", row.id);
    setBusy(null);
    await loadAbandoned();
  }

  async function saveNote(row: AbandonedLeadRow) {
    setBusy(row.id);
    await supabase.from("abandoned_leads").update({ notes: notes[row.id] ?? row.notes }).eq("id", row.id);
    setBusy(null);
    await loadAbandoned();
  }

  const needsFollowUpCount = abandoned.filter((r) => !r.contacted_at).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submissions from the site's contact forms, plus visitors who showed real intent but didn't finish.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("submitted")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "submitted"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Submitted ({leads.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("abandoned")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === "abandoned"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Abandoned {needsFollowUpCount > 0 && `(${needsFollowUpCount})`}
        </button>
      </div>

      {tab === "submitted" && (
        <section className="rounded-lg border border-border bg-card">
          {leadsLoading ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Source</th>
                    <th className="px-6 py-3 font-medium">Service</th>
                    <th className="px-6 py-3 font-medium">Received</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="transition-colors hover:bg-foreground/[0.03]">
                      <td className="px-6 py-4 font-medium text-foreground">{lead.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{lead.email}</td>
                      <td className="px-6 py-4 capitalize text-muted-foreground">{lead.source}</td>
                      <td className="px-6 py-4 text-muted-foreground">{lead.service_type || "—"}</td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={() => convertToCustomer(lead)}
                          className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          Convert to Customer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "abandoned" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Visitors who typed a real name, email, and phone into the inquiry form but left before submitting —
              caught in the background, so nothing here required them to hit Send.
            </p>
            <button
              type="button"
              onClick={() => setShowAllAbandoned((v) => !v)}
              className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {showAllAbandoned ? "Show needs follow-up" : "Show all"}
            </button>
          </div>

          {abandonedLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : abandoned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {showAllAbandoned ? "Nothing captured yet." : "Nothing needs follow-up right now."}
            </p>
          ) : (
            <div className="space-y-4">
              {abandoned.map((row) => (
                <div key={row.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-sans text-sm font-semibold text-foreground">{row.name}</h3>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <a href={`mailto:${row.email}`} className="text-primary hover:underline">
                          {row.email}
                        </a>
                        {row.phone && (
                          <a href={`tel:${row.phone}`} className="text-primary hover:underline">
                            {row.phone}
                          </a>
                        )}
                        <span className="capitalize">{row.source}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{new Date(row.created_at).toLocaleString()}</p>
                      {row.contacted_at ? (
                        <p className="mt-1 text-green-600">Contacted {new Date(row.contacted_at).toLocaleDateString()}</p>
                      ) : (
                        <p className="mt-1 text-orange-500">{STEP_LABELS[row.step_reached] ?? "In progress"}, then left</p>
                      )}
                    </div>
                  </div>

                  {(row.service_type || row.company_name || row.preferred_date || row.project_details) && (
                    <div className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
                      {row.service_type && (
                        <p>
                          <span className="text-muted-foreground">Service:</span> {row.service_type}
                        </p>
                      )}
                      {row.company_name && (
                        <p>
                          <span className="text-muted-foreground">Company:</span> {row.company_name}
                        </p>
                      )}
                      {row.preferred_date && (
                        <p>
                          <span className="text-muted-foreground">Target date:</span> {row.preferred_date}
                        </p>
                      )}
                      {row.project_details && (
                        <p className="whitespace-pre-wrap">
                          <span className="text-muted-foreground">Details:</span> {row.project_details}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-start gap-2">
                    <textarea
                      value={notes[row.id] ?? row.notes ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="Notes — what you said when you called, etc."
                      rows={2}
                      className="min-w-[240px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => saveNote(row)}
                        disabled={busy === row.id}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        Save note
                      </button>
                      {!row.contacted_at && (
                        <button
                          type="button"
                          onClick={() => markContacted(row)}
                          disabled={busy === row.id}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                        >
                          Mark contacted
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
