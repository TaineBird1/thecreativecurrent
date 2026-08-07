import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import {
  DEFAULT_MAX_PER_BATCH,
  DEFAULT_MAX_PER_DAY,
  FOLLOW_UP_AFTER_DAYS,
  type Prospect,
  type ProspectBulkSendApiResponse,
  type ProspectRunApiResponse,
} from "../lib/prospects";

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

  const [followUps, setFollowUps] = useState<Prospect[]>([]);
  const [followUpSelected, setFollowUpSelected] = useState<Set<number>>(new Set());
  const [followingUp, setFollowingUp] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<{ sent: number[]; skipped: { id: number; reason: string }[] } | null>(
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

  // Mirrors the guards in api/prospects-followup-send.ts exactly. The endpoint
  // re-checks all of them; this is only so the list shows what will actually
  // go, rather than offering rows the API would then refuse.
  async function loadFollowUps() {
    const cutoff = new Date(Date.now() - FOLLOW_UP_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .eq("status", "sent")
      .is("followed_up_at", null)
      .not("email", "is", null)
      .lt("sent_at", cutoff)
      .order("sent_at", { ascending: true });
    const rows = (data as Prospect[]) ?? [];
    setFollowUps(rows);
    // Deliberately NOT pre-selected, unlike the first-contact list. A follow-up
    // is a second unsolicited email to someone who has already ignored one, so
    // it should take a decision to include rather than a decision to remove.
    setFollowUpSelected(new Set());
  }

  const [sentRecently, setSentRecently] = useState<number | null>(null);

  // Mirrors sendGuard's rolling 24-hour window so the headroom shown matches
  // what the endpoint will actually allow.
  async function loadSendBudget() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("type", "outreach")
      .eq("status", "sent")
      .gte("created_at", since);
    setSentRecently(count ?? 0);
  }

  useEffect(() => {
    loadDrafted();
    loadFollowUps();
    loadSendBudget();
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
      await loadSendBudget();
    } catch {
      setSendResult({ sent: [], skipped: [] });
    } finally {
      setSending(false);
    }
  }

  function toggleFollowUp(id: number) {
    setFollowUpSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendFollowUps() {
    setFollowingUp(true);
    setFollowUpResult(null);
    try {
      const res = await fetch("/api/prospects-followup-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ ids: Array.from(followUpSelected) }),
      });
      const data: ProspectBulkSendApiResponse = await res.json();
      if (data.ok) setFollowUpResult({ sent: data.sent, skipped: data.skipped });
      await loadFollowUps();
      await loadSendBudget();
    } catch {
      setFollowUpResult({ sent: [], skipped: [] });
    } finally {
      setFollowingUp(false);
    }
  }

  function daysSince(iso: string | null) {
    if (!iso) return "?";
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  return (
    <div className="space-y-10">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin/outreach" className="text-xs text-primary hover:underline">
            ← Back to Outreach
          </Link>
          <div className="flex gap-4">
            <Link to="/admin/outreach/calls" className="text-xs text-primary hover:underline">
              Call list →
            </Link>
            <Link to="/admin/outreach/stats" className="text-xs text-primary hover:underline">
              Results &amp; reply rates →
            </Link>
          </div>
        </div>
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

      {sentRecently !== null && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            sentRecently >= DEFAULT_MAX_PER_DAY ? "border-accent text-accent" : "border-border text-muted-foreground"
          }`}
        >
          <strong className="text-foreground">
            {sentRecently} of {DEFAULT_MAX_PER_DAY}
          </strong>{" "}
          outreach emails sent in the last 24 hours
          {sentRecently >= DEFAULT_MAX_PER_DAY
            ? " — daily limit reached. Sends will be refused until the oldest ones fall outside the window."
            : ` — ${DEFAULT_MAX_PER_DAY - sentRecently} left, up to ${DEFAULT_MAX_PER_BATCH} per run.`}
          <span className="mt-1 block text-xs">
            The cap protects the sending account: a burst of near-identical emails is what gets an address filtered,
            which would end the channel entirely. Follow-ups draw on the same budget.
          </span>
        </div>
      )}

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

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-sans text-sm font-semibold">
            Follow-ups available ({followUps.length}) — {followUpSelected.size} selected
          </h2>
          <button
            type="button"
            onClick={sendFollowUps}
            disabled={followingUp || followUpSelected.size === 0}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-opacity disabled:opacity-50"
          >
            {followingUp ? "Sending..." : `Send ${followUpSelected.size} follow-up${followUpSelected.size === 1 ? "" : "s"}`}
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Emailed more than {FOLLOW_UP_AFTER_DAYS} days ago and never replied. These are{" "}
          <strong className="text-foreground">not pre-selected</strong> — a follow-up is a second unsolicited email to
          someone who already ignored one, so tick only the ones worth it. Each business can be followed up{" "}
          <strong className="text-foreground">once</strong>, and the message says so.
        </p>

        {followUpResult && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3 text-sm">
            <p className="text-green-500">Sent: {followUpResult.sent.length}</p>
            {followUpResult.skipped.length > 0 && (
              <ul className="mt-1 ml-4 list-disc text-muted-foreground">
                {followUpResult.skipped.map((s) => (
                  <li key={s.id}>
                    {followUps.find((f) => f.id === s.id)?.business_name || s.id} — {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-2">
          {followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing due — anyone emailed in the last {FOLLOW_UP_AFTER_DAYS} days will appear here once that window
              passes.
            </p>
          ) : (
            followUps.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={followUpSelected.has(p.id)}
                    onChange={() => toggleFollowUp(p.id)}
                    className="mt-1.5 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.business_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.email} · emailed {daysSince(p.sent_at)} days ago
                      {p.category ? ` · ${p.category}` : ""}
                    </p>
                    {p.email_defect ? (
                      <p className="mt-1 text-xs text-primary">Will lead with: {p.email_defect}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No specific defect on file — falls back to the generic wording.
                      </p>
                    )}
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
