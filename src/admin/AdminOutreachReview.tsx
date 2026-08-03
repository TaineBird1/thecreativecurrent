import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import type { Prospect, ProspectBulkSendApiResponse, ProspectRunApiResponse } from "../lib/prospects";

export function AdminOutreachReview() {
  const [drafted, setDrafted] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [emails, setEmails] = useState<Record<number, string>>({});

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number[]; skipped: { id: number; reason: string }[] } | null>(
    null
  );

  async function loadDrafted() {
    setLoading(true);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "drafted")
      .order("created_at", { ascending: false });
    const rows = (data as Prospect[]) ?? [];
    setDrafted(rows);
    setSelected(new Set(rows.map((r) => r.id)));
    const emailMap: Record<number, string> = {};
    rows.forEach((r) => (emailMap[r.id] = r.email ?? ""));
    setEmails(emailMap);
    setLoading(false);
  }

  useEffect(() => {
    loadDrafted();
  }, []);

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    return `Bearer ${data.session?.access_token}`;
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/outreach-run", {
        method: "POST",
        headers: { Authorization: await authHeader() },
      });
      const data: ProspectRunApiResponse = await res.json();
      setRunResult(
        data.ok
          ? `Ran ${data.searchesRun} saved search(es), found ${data.created} new lead(s).`
          : data.error || "Run failed"
      );
      await loadDrafted();
    } catch {
      setRunResult("Run failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveEmail(id: number, email: string) {
    setEmails((prev) => ({ ...prev, [id]: email }));
    await supabase.from("prospects").update({ email }).eq("id", id);
  }

  async function sendSelected() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/prospects-bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data: ProspectBulkSendApiResponse = await res.json();
      if (data.ok) {
        setSendResult({ sent: data.sent, skipped: data.skipped });
      }
      await loadDrafted();
    } catch {
      setSendResult({ sent: [], skipped: [] });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <Link to="/admin/outreach" className="text-xs text-primary hover:underline">
          ← Back to Outreach
        </Link>
        <h1 className="mt-2 font-sans text-2xl font-bold">Daily Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run your saved searches, skim what got drafted, uncheck anything you don't like, send the rest. Nothing
          emails out until you click "Send selected."
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {running ? "Running (can take a minute)..." : "Run all saved searches now"}
          </button>
          {runResult && <span className="text-sm text-muted-foreground">{runResult}</span>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Manage which categories/locations get searched from the{" "}
          <Link to="/admin/outreach" className="text-primary hover:underline">
            Outreach page
          </Link>
          . This also runs automatically every morning.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-sm font-semibold">
            Ready to review ({drafted.length}) — {selected.size} selected
          </h2>
          <button
            type="button"
            onClick={sendSelected}
            disabled={sending || selected.size === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {sending ? "Sending..." : `Send ${selected.size} selected`}
          </button>
        </div>

        {sendResult && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">
            <p className="text-green-500">Sent: {sendResult.sent.length}</p>
            {sendResult.skipped.length > 0 && (
              <div className="mt-1 text-muted-foreground">
                Skipped:
                <ul className="ml-4 list-disc">
                  {sendResult.skipped.map((s) => (
                    <li key={s.id}>
                      {drafted.find((d) => d.id === s.id)?.business_name || s.id} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : drafted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting for review — run a search above.</p>
          ) : (
            drafted.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="mt-1.5 h-4 w-4"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{p.business_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.reason === "poor_website" ? `Poor website (score ${p.page_speed_score})` : "No website"}
                          {p.category ? ` · ${p.category}` : ""}
                        </p>
                      </div>
                      <Link to="/admin/outreach" className="shrink-0 text-xs text-primary hover:underline">
                        Edit full draft →
                      </Link>
                    </div>
                    <input
                      value={emails[p.id] ?? ""}
                      onChange={(e) => setEmails((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={(e) => saveEmail(p.id, e.target.value)}
                      placeholder="Add an email address to enable sending"
                      className="w-full rounded-lg border border-border bg-black px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Preview draft</summary>
                      <p className="mt-1 font-medium text-foreground">{p.draft_subject}</p>
                      <p className="mt-1 whitespace-pre-wrap">{p.draft_body}</p>
                    </details>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
