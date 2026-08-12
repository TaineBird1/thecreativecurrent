import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge } from "../components/StatusBadge";
import type { Customer, InviteCustomerApiResponse } from "../lib/customers";

type PrefillState = {
  prefill?: {
    business_name: string;
    contact_name: string;
    contact_email: string;
    website_url: string;
  };
};

type BillingDraft = {
  retainer_amount: string;
  retainer_currency: string;
  billing_day: string;
  billing_active: boolean;
};

function draftFrom(c: Customer): BillingDraft {
  return {
    retainer_amount: c.retainer_amount != null ? String(c.retainer_amount) : "",
    retainer_currency: c.retainer_currency,
    billing_day: c.billing_day != null ? String(c.billing_day) : "",
    billing_active: c.billing_active,
  };
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, BillingDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  async function loadCustomers() {
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .neq("status", "internal")
      .order("created_at", { ascending: false });
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
      setSuccess(`Invited ${form.contact_email} — customer #${data.customer_id}. Set their retainer below.`);
      setForm({ business_name: "", contact_name: "", contact_email: "", website_url: "" });
      await loadCustomers();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(c: Customer) {
    setDrafts((prev) => ({ ...prev, [c.id]: prev[c.id] ?? draftFrom(c) }));
    setEditingId(c.id);
  }

  function updateDraft(id: number, fields: Partial<BillingDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...fields } }));
  }

  async function saveBilling(id: number) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        retainer_amount: draft.retainer_amount === "" ? null : Number(draft.retainer_amount),
        retainer_currency: draft.retainer_currency || "ZAR",
        billing_day: draft.billing_day === "" ? null : Number(draft.billing_day),
        billing_active: draft.billing_active,
      })
      .eq("id", id);
    setSavingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    await loadCustomers();
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-2xl font-bold">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invite new clients, manage existing ones, and set up retainer billing.</p>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Invite a Customer</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="c-business" className="text-sm text-muted-foreground">
              Business Name
            </label>
            <input
              id="c-business"
              name="business_name"
              required
              value={form.business_name}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-background px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-contact-name" className="text-sm text-muted-foreground">
              Contact Name
            </label>
            <input
              id="c-contact-name"
              name="contact_name"
              value={form.contact_name}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-background px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-email" className="text-sm text-muted-foreground">
              Contact Email
            </label>
            <input
              id="c-email"
              name="contact_email"
              type="email"
              required
              value={form.contact_email}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-background px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="c-website" className="text-sm text-muted-foreground">
              Website URL
            </label>
            <input
              id="c-website"
              name="website_url"
              placeholder="https://"
              value={form.website_url}
              onChange={handleChange}
              className="h-11 rounded-lg border border-border bg-background px-4 text-foreground outline-none focus:border-primary"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
          {success && <p className="text-sm text-primary sm:col-span-2">{success}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {submitting ? "Inviting..." : "Invite Customer"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">All Customers</h2>
        </div>
        {loading ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {customers.map((c) => {
              const isEditing = editingId === c.id;
              const draft = drafts[c.id] ?? draftFrom(c);
              return (
                <div key={c.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/admin/customers/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.business_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{c.contact_email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge label={c.status} tone={c.status === "active" ? "success" : "neutral"} />
                      {c.billing_active && c.retainer_amount != null ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatMoney(c.retainer_amount, c.retainer_currency)} · day {c.billing_day}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No retainer set</span>
                      )}
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingId(null) : startEditing(c))}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        {isEditing ? "Close" : "Billing"}
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-4">
                      <div className="grid gap-1.5">
                        <label className="text-xs text-muted-foreground">Retainer Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.retainer_amount}
                          onChange={(e) => updateDraft(c.id, { retainer_amount: e.target.value })}
                          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-xs text-muted-foreground">Currency</label>
                        <input
                          value={draft.retainer_currency}
                          onChange={(e) => updateDraft(c.id, { retainer_currency: e.target.value.toUpperCase() })}
                          maxLength={3}
                          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-xs text-muted-foreground">Billing Day (1–28)</label>
                        <input
                          type="number"
                          min="1"
                          max="28"
                          value={draft.billing_day}
                          onChange={(e) => updateDraft(c.id, { billing_day: e.target.value })}
                          className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={draft.billing_active}
                            onChange={(e) => updateDraft(c.id, { billing_active: e.target.checked })}
                          />
                          Active
                        </label>
                      </div>
                      <div className="sm:col-span-4">
                        <button
                          type="button"
                          onClick={() => saveBilling(c.id)}
                          disabled={savingId === c.id}
                          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                        >
                          {savingId === c.id ? "Saving..." : "Save billing"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
