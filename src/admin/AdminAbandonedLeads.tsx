import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { AbandonedLeadRow } from "../lib/leads";

const STEP_LABELS: Record<number, string> = {
  0: "Chose a service",
  1: "Picked a date",
  2: "Filled in their details",
  3: "Reviewed their own submission",
};

export function AdminAbandonedLeads() {
  const [rows, setRows] = useState<AbandonedLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("abandoned_leads").select("*").order("created_at", { ascending: false });
    if (!showAll) query = query.is("contacted_at", null);
    const { data } = await query;
    setRows((data as AbandonedLeadRow[]) ?? []);
    setLoading(false);
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  async function markContacted(row: AbandonedLeadRow) {
    setBusy(row.id);
    await supabase.from("abandoned_leads").update({ contacted_at: new Date().toISOString() }).eq("id", row.id);
    setBusy(null);
    await load();
  }

  async function saveNote(row: AbandonedLeadRow) {
    setBusy(row.id);
    await supabase.from("abandoned_leads").update({ notes: notes[row.id] ?? row.notes }).eq("id", row.id);
    setBusy(null);
    await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/leads" className="text-xs text-primary hover:underline">
          ← Back to Leads
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-2xl font-bold">Abandoned Inquiries</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visitors who typed a real name, email, and phone into the inquiry form but left before submitting —
              caught in the background, so nothing here required them to hit Send.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {showAll ? "Show needs follow-up" : "Show all"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {showAll ? "Nothing captured yet." : "Nothing needs follow-up right now."}
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
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
                    <p className="mt-1 text-green-500">Contacted {new Date(row.contacted_at).toLocaleDateString()}</p>
                  ) : (
                    <p className="mt-1 text-orange-400">{STEP_LABELS[row.step_reached] ?? "In progress"}, then left</p>
                  )}
                </div>
              </div>

              {(row.service_type || row.company_name || row.preferred_date || row.project_details) && (
                <div className="space-y-1 rounded-lg border border-border bg-black p-3 text-sm">
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
  );
}
