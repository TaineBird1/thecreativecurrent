import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const POLL_INTERVAL_MS = 10000;

export function LiveVisitorCount({ customerId }: { customerId: number }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      const { data } = await supabase.rpc("live_visitor_count", { customer_id_param: customerId });
      if (mounted) setCount(typeof data === "number" ? data : 0);
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [customerId]);

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">Live on your site right now</p>
      <p className="mt-2 font-sans text-4xl font-bold text-primary">{count ?? "—"}</p>
    </div>
  );
}
