import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { buildCallScript, buildOutreachDraft } from "../lib/outreachTemplate";
import { callQueueStatuses, type Prospect, type ProspectStatus } from "../lib/prospects";

// Leads that can only be reached by phone. Google Places returns a number for
// almost every business and an email for none, so this queue is where the
// strongest prospects end up -- a business whose domain has lapsed has no page
// left to scrape an address from, and is exactly the one worth talking to.

function daysAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

export function AdminOutreachCalls() {
  const [queue, setQueue] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("prospects")
      .select("*")
      .in("status", callQueueStatuses)
      .not("phone", "is", null)
      .order("created_at", { ascending: true });

    const rows = (data as Prospect[]) ?? [];
    // Anyone who asked to be called back comes first -- they are the only
    // people in this list who are expecting the phone to ring. After that,
    // fewest attempts first, so nobody gets rung repeatedly while untouched
    // leads sit behind them.
    rows.sort((a, b) => {
      if (a.status === "callback" && b.status !== "callback") return -1;
      if (b.status === "callback" && a.status !== "callback") return 1;
      if (a.call_attempts !== b.call_attempts) return a.call_attempts - b.call_attempts;
      return (a.last_called_at ?? "").localeCompare(b.last_called_at ?? "");
    });
    setQueue(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function logCall(p: Prospect, status: ProspectStatus) {
    setBusy(p.id);
    await supabase
      .from("prospects")
      .update({
        status,
        call_attempts: p.call_attempts + 1,
        last_called_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    await load();
    setBusy(null);
  }

  async function saveNotes(id: number, call_notes: string) {
    await supabase.from("prospects").update({ call_notes }).eq("id", id);
  }

  // The bridge out of this queue: once a call produces an email address, the
  // lead stops being a call-first lead and joins the normal email flow with a
  // draft already written. It leaves this list and appears on the review page.
  async function captureEmail(p: Prospect) {
    const email = (emailDrafts[p.id] ?? "").trim();
    if (!email) return;
    setBusy(p.id);
    const { subject, body } = buildOutreachDraft(p.business_name, p.category, p.reason, p.email_defect);
    await supabase
      .from("prospects")
      .update({
        email,
        status: "drafted",
        draft_subject: subject,
        draft_body: body,
        call_attempts: p.call_attempts + 1,
        last_called_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    await load();
    setBusy(null);
  }

  const callbacks = queue.filter((p) => p.status === "callback").length;
  const untouched = queue.filter((p) => p.call_attempts === 0).length;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Link to="/admin/outreach" className="text-xs text-primary hover:underline">
            ← Back to Outreach
          </Link>
          <Link to="/admin/outreach/review" className="text-xs text-primary hover:underline">
            Email review →
          </Link>
        </div>
        <h1 className="mt-2 font-sans text-2xl font-bold">Call List</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Leads with a phone number and no email — the only way to reach these is to ring them. {queue.length} in the
          queue{callbacks > 0 ? `, ${callbacks} expecting a call back` : ""}
          {untouched > 0 ? `, ${untouched} never tried` : ""}.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody to call. Call-first leads appear here automatically after the morning run.
        </p>
      ) : (
        <div className="space-y-3">
          {queue.map((p, i) => {
            const script = buildCallScript(p.business_name, p.category, p.email_defect);
            return (
              <div
                key={p.id}
                className={`rounded-lg border bg-card p-4 ${
                  p.status === "callback" ? "border-primary" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.business_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.category ? `${p.category} · ` : ""}
                      {p.address ?? "no address"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.call_attempts === 0
                        ? "Not tried yet"
                        : `${p.call_attempts} attempt${p.call_attempts === 1 ? "" : "s"} · last ${daysAgo(p.last_called_at)}`}
                      {p.status === "callback" ? " · they asked for a call back" : ""}
                    </p>
                  </div>
                  <a
                    href={`tel:${p.phone?.replace(/\s/g, "")}`}
                    className="shrink-0 rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"
                  >
                    {p.phone}
                  </a>
                </div>

                {p.email_defect && (
                  <p className="mt-3 rounded-lg border border-border bg-black px-3 py-2 text-xs text-primary">
                    {p.email_defect}
                  </p>
                )}

                <details className="mt-3 text-xs" open={i === 0}>
                  <summary className="cursor-pointer text-muted-foreground">Call script</summary>
                  <div className="mt-2 space-y-2 text-foreground">
                    <p>{script.opener}</p>
                    <p>{script.point}</p>
                    <p className="text-primary">{script.ask}</p>
                    <p>{script.close}</p>
                    <p className="text-muted-foreground">If they're not interested: {script.ifNo}</p>
                  </div>
                </details>

                <textarea
                  defaultValue={p.call_notes ?? ""}
                  onBlur={(e) => saveNotes(p.id, e.target.value)}
                  placeholder="Notes from the call…"
                  rows={2}
                  className="mt-3 w-full rounded-lg border border-border bg-black px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => logCall(p, "no_answer")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
                  >
                    No answer
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => logCall(p, "callback")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground disabled:opacity-50"
                  >
                    Call back later
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => logCall(p, "won")}
                    className="rounded-lg border border-green-600 px-3 py-1.5 text-xs text-green-500 disabled:opacity-50"
                  >
                    Interested
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => logCall(p, "lost")}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
                  >
                    Not interested
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={emailDrafts[p.id] ?? ""}
                    onChange={(e) => setEmailDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="Got their email on the call? Paste it here"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-black px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={busy === p.id || !(emailDrafts[p.id] ?? "").trim()}
                    onClick={() => captureEmail(p)}
                    className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40"
                  >
                    Save &amp; draft email
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Saving an email address moves that lead out of this list and onto the{" "}
        <Link to="/admin/outreach/review" className="text-primary hover:underline">
          email review page
        </Link>{" "}
        with a draft already written — it is never sent from here.
      </p>
    </div>
  );
}
