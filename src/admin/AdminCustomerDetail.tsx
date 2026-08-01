import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { LiveVisitorCount } from "../components/LiveVisitorCount";
import { TrafficChart } from "../components/TrafficChart";
import { ChangeRequestList } from "../components/ChangeRequestList";
import { StatusBadge } from "../components/StatusBadge";
import type { Customer } from "../lib/customers";

export function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single()
      .then(({ data }) => {
        setCustomer((data as Customer) ?? null);
        setLoading(false);
      });
  }, [customerId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!customer) return <p className="text-sm text-muted-foreground">Customer not found.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/customers" className="text-sm text-muted-foreground hover:text-primary">
          ← Back to Customers
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-sans text-2xl font-bold">{customer.business_name}</h1>
          <StatusBadge label={customer.status} tone={customer.status === "active" ? "success" : "neutral"} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{customer.contact_email}</p>
        {customer.website_url && (
          <a
            href={customer.website_url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {customer.website_url}
          </a>
        )}
      </div>

      <div className="space-y-6">
        <LiveVisitorCount customerId={customer.id} />
        <TrafficChart customerId={customer.id} />
      </div>

      <div>
        <h2 className="mb-4 font-sans text-lg font-semibold">Change Requests</h2>
        <ChangeRequestList customerId={customer.id} canUpdateStatus />
      </div>
    </div>
  );
}
