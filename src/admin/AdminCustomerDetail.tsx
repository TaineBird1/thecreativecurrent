import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { LiveVisitorCount } from "../components/LiveVisitorCount";
import { TrafficChart } from "../components/TrafficChart";
import { ChangeRequestList } from "../components/ChangeRequestList";
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
        <h2 className="mt-2 font-sans text-2xl font-bold">{customer.business_name}</h2>
        <p className="text-sm text-muted-foreground">{customer.contact_email}</p>
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
        <h3 className="mb-4 font-sans text-lg font-semibold">Change Requests</h3>
        <ChangeRequestList customerId={customer.id} canUpdateStatus />
      </div>
    </div>
  );
}
