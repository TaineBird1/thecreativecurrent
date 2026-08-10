import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { CheckRepliesApiResponse, Prospect, ProspectSendApiResponse } from "../lib/prospects";

// Prospects who wrote back. api/check-replies.ts (cron + the "Check now"
// button here) polls Gmail via IMAP and drops a suggested response here for
// review -- nothing sends until that suggestion (or a rewrite of it) is
// explicitly approved via "Send reply", the same shape as every other send
// in this system.
export function AdminOutreachReplies() {
  const [replies, setReplies] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "replied")
      .order("reply_received_at", { ascending: false });
    setReplies((data as Prospect[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function checkNow() {
    setChecking(true);
    setCheckResult(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch("/api/check-replies", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: CheckRepliesApiResponse = await res.json();
      if (!data.ok) {
        setCheckResult(data.error);
        return;
      }
      setCheckResult(`Checked ${data.checked}, found ${data.matched} new repl${data.matched === 1 ? "y" : "ies"}.`);
      await load();
    } catch {
      setCheckResult("Something went wrong checking for replies.");
    } finally {
      setChecking(false);
    }
  }

  async function sendReply(p: Prospect) {
    const body = drafts[p.id] ?? p.ai_suggested_reply ?? "";
    if (!body.trim()) return;
    setBusy(p.id);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch("/api/prospects-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: p.id, replyBody: body }),
      });
      const data: ProspectSendApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      await load();
    } catch {
      setError("Something went wrong sending this reply.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/outreach" className="text-xs text-primary hover:underline">
          ← Back to Outreach
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-2xl font-bold">Replies</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prospects who wrote back, with an AI-drafted response to review before sending.
            </p>
          </div>
          <button
            type="button"
            onClick={checkNow}
            disabled={checking}
            className="shrink-0 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {checking ? "Checking..." : "Check now"}
          </button>
        </div>
        {checkResult && <p className="mt-2 text-xs text-muted-foreground">{checkResult}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : replies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No replies yet.</p>
      ) : (
        <div className="space-y-4">
          {replies.map((p) => (
            <div key={p.id} className="space-y-3 rounded-lg border border-border bg-card p-5">
              <div>
                <h3 className="font-sans text-sm font-semibold text-foreground">{p.business_name}</h3>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </div>

              <div className="rounded-lg border border-border bg-black p-3">
                <p className="mb-1 text-xs text-muted-foreground">Their reply</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">{p.reply_body}</p>
              </div>

              {p.reply_sent_at ? (
                <p className="text-xs text-green-500">Reply sent {new Date(p.reply_sent_at).toLocaleDateString()}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {p.ai_suggested_reply ? "Suggested reply (edit before sending)" : "No suggestion generated — write one"}
                  </p>
                  <textarea
                    value={drafts[p.id] ?? p.ai_suggested_reply ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    rows={6}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => sendReply(p)}
                    disabled={busy === p.id}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                  >
                    {busy === p.id ? "Sending..." : "Send reply"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
