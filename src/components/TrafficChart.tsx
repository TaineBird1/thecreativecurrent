import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type DayBucket = { date: string; count: number };

export function TrafficChart({ customerId }: { customerId: number }) {
  const [buckets, setBuckets] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from("analytics_events")
        .select("created_at")
        .eq("customer_id", customerId)
        .eq("event_type", "pageview")
        .gte("created_at", since.toISOString());

      const counts = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        counts.set(d.toISOString().slice(0, 10), 0);
      }
      for (const row of data ?? []) {
        const key = (row.created_at as string).slice(0, 10);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      setBuckets(Array.from(counts.entries()).map(([date, count]) => ({ date, count })));
      setLoading(false);
    }
    load();
  }, [customerId]);

  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">Pageviews, last 7 days</p>
      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-6 flex h-32 items-end gap-2">
          {buckets.map((b) => (
            <div key={b.date} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-t bg-primary/70"
                style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count > 0 ? "4px" : "0" }}
                title={`${b.count} pageviews`}
              />
              <span className="text-[10px] text-muted-foreground">
                {new Date(b.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
