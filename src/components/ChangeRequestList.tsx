import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { STORAGE_BUCKET, type ChangeRequest, type ChangeRequestStatus } from "../lib/changeRequests";

const statusLabels: Record<ChangeRequestStatus, string> = {
  submitted: "Submitted",
  in_progress: "In Progress",
  done: "Done",
};

const statusColors: Record<ChangeRequestStatus, string> = {
  submitted: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-green-500",
};

type ChangeRequestWithCustomer = ChangeRequest & {
  customers?: { business_name: string } | null;
};

type ChangeRequestListProps = {
  customerId?: number;
  canUpdateStatus?: boolean;
  showBusinessName?: boolean;
  refreshKey?: number;
};

export function ChangeRequestList({
  customerId,
  canUpdateStatus = false,
  showBusinessName = false,
  refreshKey,
}: ChangeRequestListProps) {
  const [requests, setRequests] = useState<ChangeRequestWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      const selectClause = showBusinessName ? "*, customers(business_name)" : "*";
      let query = supabase
        .from("change_requests")
        .select(selectClause)
        .order("created_at", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      const { data } = await query;
      const rows = (data as unknown as ChangeRequestWithCustomer[]) ?? [];
      setRequests(rows);

      const allPaths = rows.flatMap((r) => r.screenshot_paths);
      if (allPaths.length > 0) {
        const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(allPaths, 3600);
        const urlMap: Record<string, string> = {};
        signed?.forEach((s) => {
          if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl;
        });
        setSignedUrls(urlMap);
      }
      setLoading(false);
    }
    load();
  }, [customerId, refreshKey]);

  async function updateStatus(id: number, status: ChangeRequestStatus) {
    await supabase.from("change_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (requests.length === 0) return <p className="text-sm text-muted-foreground">No change requests yet.</p>;

  return (
    <div className="space-y-4">
      {requests.map((req) => (
        <div key={req.id} className="rounded-lg border border-border bg-card p-6">
          {showBusinessName && req.customers?.business_name && (
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-primary">
              {req.customers.business_name}
            </p>
          )}
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-foreground">{req.description}</p>
            <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide ${statusColors[req.status]}`}>
              {statusLabels[req.status]}
            </span>
          </div>

          {req.screenshot_paths.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {req.screenshot_paths.map((path) =>
                signedUrls[path] ? (
                  <a key={path} href={signedUrls[path]} target="_blank" rel="noreferrer">
                    <img src={signedUrls[path]} alt="Screenshot" className="h-20 w-20 rounded-lg object-cover" />
                  </a>
                ) : null
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">{new Date(req.created_at).toLocaleDateString()}</p>

          {canUpdateStatus && (
            <div className="mt-4 flex gap-2">
              {(["submitted", "in_progress", "done"] as ChangeRequestStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateStatus(req.id, s)}
                  disabled={req.status === s}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    req.status === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {statusLabels[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
