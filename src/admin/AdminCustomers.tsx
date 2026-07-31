import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Customer, InviteCustomerApiResponse } from "../lib/customers";

type PrefillState = {
  prefill?: {
    business_name: string;
    contact_name: string;
    contact_email: string;
    website_url: string;
  };
};

export function AdminCustomers() {
  const location = useLocation();
  const prefill = (location.state as PrefillState | null)?.prefill;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(
    prefill ?? {
      business_name: "",
      contact_name: "",
      contact_email: "",
      website_url: "",
    }
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadCustomers() {
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setCustomers((data as Customer[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/invite-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data: InviteCustomerApiResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(!data.ok ? data.error : "Something went wrong.");
        return;
      }
      setSuccess(`Invited ${form.contact_email} — customer #${data.customer_id}.`);
      setForm({ business_name: "", contact_name: "", contact_email: "", website_url: "" });
      await loadCustomers();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-sans text-lg font-semibold">Invite a Customer</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 rounded-lg border border-border bg-card p-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="c-business" className="text-sm text-muted-foreground">Business Name</label>
            <input
              id="c-business"
              name="business_name"
              required
              value={form.business_name}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-contact-name" className="text-sm text-muted-foreground">Contact Name</label>
            <input
              id="c-contact-name"
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-email" className="text-sm text-muted-foreground">Contact Email</label>
            <input
              id="c-email"
              name="contact_email"
              type="email"
              required
              value={form.contact_email}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-website" className="text-sm text-muted-foreground">Website URL</label>
            <input
              id="c-website"
              name="website_url"
              placeholder="https://"
              value={form.website_url}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-500 sm:col-span-2">{error}</p>}
          {success && <p className="text-sm text-primary sm:col-span-2">{success}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? "Inviting..." : "Invite Customer"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-sans text-lg font-semibold">Customers</h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Since</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3">{c.business_name}</td>
                    <td className="px-4 py-3">{c.contact_email}</td>
                    <td className="px-4 py-3">{c.website_url || "—"}</td>
                    <td className="px-4 py-3">{c.status}</td>
                    <td className="px-4 py-3">{new Date(c.created_at).toLocaleDateString()}</td>
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
