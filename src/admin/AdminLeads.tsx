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
    <div>
      <h2 className="font-sans text-lg font-semibold">Leads</h2>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No leads yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-4 py-3">{lead.name}</td>
                  <td className="px-4 py-3">{lead.email}</td>
                  <td className="px-4 py-3 capitalize">{lead.source}</td>
                  <td className="px-4 py-3">{lead.service_type || "—"}</td>
                  <td className="px-4 py-3">{new Date(lead.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => convertToCustomer(lead)}
                      className="rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
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
    </div>
  );
}
