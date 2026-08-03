import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { EmailLog } from "../lib/emailLog";

const TYPE_LABELS: Record<string, string> = {
  outreach: "Outreach",
  lead_notification: "Lead notification",
  other: "Other",
};

export function AdminActivity() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("email_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data as EmailLog[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-2xl font-bold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every email this dashboard has sent — outreach and lead notifications.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total logged</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{loading ? "—" : logs.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Sent</p>
          <p className="mt-1 text-3xl font-bold text-green-500">{loading ? "—" : sentCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Failed</p>
          <p className="mt-1 text-3xl font-bold text-red-500">{loading ? "—" : failedCount}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-card text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-medium">When</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Type</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nothing sent yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-white/5">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-foreground">{TYPE_LABELS[log.type] || log.type}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-foreground">{log.recipient}</td>
                <td className="max-w-[320px] truncate px-4 py-3 text-foreground">{log.subject}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {log.status === "sent" ? (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-500">Sent</span>
                  ) : (
                    <span
                      className="cursor-help rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-500"
                      title={log.error || ""}
                    >
                      Failed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
