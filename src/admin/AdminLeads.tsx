import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { LeadRow } from "../lib/leads";

export function AdminLeads() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setLeads((data as LeadRow[]) ?? []);
        setLoading(false);
      });
  }, []);

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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Submissions from the site's contact forms.</p>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">All Leads</h2>
        </div>
        {loading ? (
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
                  <tr key={lead.id} className="transition-colors hover:bg-white/[0.03]">
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
    </div>
  );
}
