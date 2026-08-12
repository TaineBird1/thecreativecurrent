import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { AnalyticsEventRow } from "../lib/analytics";

const WINDOW_DAYS = 30;

export function RevenueTracker({ customerId }: { customerId: number }) {
  const [total, setTotal] = useState<number | null>(null);
  const [recent, setRecent] = useState<AnalyticsEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - WINDOW_DAYS);

      const [{ data: totalData }, { data: recentData }] = await Promise.all([
        supabase.rpc("customer_revenue", { customer_id_param: customerId, days_param: WINDOW_DAYS }),
        supabase
          .from("analytics_events")
          .select("*")
          .eq("customer_id", customerId)
          .eq("event_type", "conversion")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (!mounted) return;
      setTotal(typeof totalData === "number" ? totalData : Number(totalData ?? 0));
      setRecent((recentData as AnalyticsEventRow[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [customerId]);

  const formatted =
    total === null
      ? "—"
      : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(
          total
        );

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">Revenue tracked, last {WINDOW_DAYS} days</p>
      <p className="mt-2 font-sans text-4xl font-bold text-primary">{loading ? "—" : formatted}</p>

      {!loading && recent.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          No conversions reported yet. Revenue only shows up once your site calls{" "}
          <code className="rounded bg-foreground/10 px-1 py-0.5">window.tccTrackConversion(value, label)</code> on a sale
          or booking.
        </p>
      )}

      {!loading && recent.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {recent.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-muted-foreground">{r.label || "Conversion"}</span>
              <span className="font-mono text-foreground">
                {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(r.value ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
