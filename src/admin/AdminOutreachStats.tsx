import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { websiteHealthLabel, type Prospect } from "../lib/prospects";

type EmailLogRow = { created_at: string; status: string };

// Statuses that mean the outreach worked. "replied" is the honest measure of
// whether a message landed; won/lost both imply a reply happened first, so
// they count too -- otherwise converting a prospect would make the reply rate
// go DOWN, which would be a perverse way to measure success.
const RESPONDED = new Set(["replied", "won", "lost"]);

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-sans text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** A breakdown table with a reply rate per row, sorted worst-covered first. */
function Breakdown({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: { key: string; sent: number; responded: number }[];
}) {
  const withSends = rows.filter((r) => r.sent > 0).sort((a, b) => b.sent - a.sent);
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-sans text-sm font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">{note}</p>
      {withSends.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing emailed in this group yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 font-normal">Group</th>
              <th className="pb-2 text-right font-normal">Emailed</th>
              <th className="pb-2 text-right font-normal">Replied</th>
              <th className="pb-2 text-right font-normal">Rate</th>
            </tr>
          </thead>
          <tbody>
            {withSends.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-2 text-foreground">{r.key}</td>
                <td className="py-2 text-right text-muted-foreground">{r.sent}</td>
                <td className="py-2 text-right text-muted-foreground">{r.responded}</td>
                <td className="py-2 text-right text-foreground">
                  {r.sent < 10 ? (
                    <span className="text-muted-foreground" title="Too few sends to read anything into">
                      {Math.round((r.responded / r.sent) * 100)}%*
                    </span>
                  ) : (
                    `${Math.round((r.responded / r.sent) * 100)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-muted-foreground">* fewer than 10 sends — not a meaningful rate yet.</p>
    </section>
  );
}

export function AdminOutreachStats() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [log, setLog] = useState<EmailLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: l }] = await Promise.all([
        supabase.from("prospects").select("*"),
        supabase
          .from("email_log")
          .select("created_at, status")
          .eq("type", "outreach")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      setProspects((p as Prospect[]) ?? []);
      setLog((l as EmailLogRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const contacted = prospects.filter((p) => p.sent_at !== null);
    const responded = prospects.filter((p) => RESPONDED.has(p.status));
    const won = prospects.filter((p) => p.status === "won");
    const followedUp = prospects.filter((p) => p.followed_up_at !== null);
    const callFirst = prospects.filter((p) => p.status === "new" && p.phone && !p.email);
    const awaitingEmail = prospects.filter((p) => !p.email);

    const group = (keyOf: (p: Prospect) => string | null) => {
      const map = new Map<string, { sent: number; responded: number }>();
      for (const p of contacted) {
        const key = keyOf(p);
        if (!key) continue;
        const entry = map.get(key) ?? { sent: 0, responded: 0 };
        entry.sent++;
        if (RESPONDED.has(p.status)) entry.responded++;
        map.set(key, entry);
      }
      return [...map.entries()].map(([key, v]) => ({ key, ...v }));
    };

    // Sends per day for the last 14 days, from the log rather than from
    // prospects -- the log records a row per actual send attempt, including
    // follow-ups and failures, which is what matters for a sending-rate view.
    const byDay = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      byDay.set(d, 0);
    }
    for (const row of log) {
      if (row.status !== "sent") continue;
      const d = row.created_at.slice(0, 10);
      if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }

    return {
      total: prospects.length,
      contacted: contacted.length,
      responded: responded.length,
      won: won.length,
      followedUp: followedUp.length,
      callFirst: callFirst.length,
      awaitingEmail: awaitingEmail.length,
      byReason: group((p) => (p.reason === "no_website" ? "No website" : "Poor website")),
      byCategory: group((p) => p.category?.trim() || null),
      byDefect: group((p) => {
        if (!p.email_defect) return p.reason === "no_website" ? "No website at all" : "No defect recorded";
        // email_defect is a sentence; bucket it back to a readable class by
        // matching the distinctive phrase from each websiteHealth state.
        if (/no longer resolves/.test(p.email_defect)) return websiteHealthLabel.dns_failure;
        if (/security certificate/.test(p.email_defect)) return websiteHealthLabel.tls_error;
        if (/returning an error|no longer exists/.test(p.email_defect)) return websiteHealthLabel.http_error;
        if (/placeholder page|file listing/.test(p.email_defect)) return websiteHealthLabel.parked;
        if (/free hosting subdomain/.test(p.email_defect)) return websiteHealthLabel.builder_subdomain;
        if (/isn't set up for mobile/.test(p.email_defect)) return "Not mobile-friendly";
        if (/accepting connections/.test(p.email_defect)) return websiteHealthLabel.connection_refused;
        return "Other";
      }),
      byDay: [...byDay.entries()],
    };
  }, [prospects, log]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const maxDay = Math.max(1, ...stats.byDay.map(([, n]) => n));

  return (
    <div className="space-y-10">
      <div>
        <Link to="/admin/outreach/review" className="text-xs text-primary hover:underline">
          ← Back to Daily Review
        </Link>
        <h1 className="mt-2 font-sans text-2xl font-bold">Outreach Results</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Which kinds of lead actually reply, so the saved searches can be pointed at more of what works.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Prospects" value={stats.total} sub={`${stats.awaitingEmail} without an email`} />
        <Stat label="Emailed" value={stats.contacted} sub={`${stats.followedUp} followed up`} />
        <Stat
          label="Replied"
          value={stats.responded}
          sub={stats.contacted ? `${Math.round((stats.responded / stats.contacted) * 100)}% of those emailed` : "—"}
        />
        <Stat label="Won" value={stats.won} sub={`${stats.callFirst} call-first leads waiting`} />
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-sans text-sm font-semibold">Emails sent per day (last 14 days)</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Gmail's own limit is around 500 a day, but reputation suffers long before that — a burst of near-identical
          messages is what gets an address filtered. Flat and low beats spiky.
        </p>
        <div className="flex h-24 items-end gap-1">
          {stats.byDay.map(([day, n]) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-1" title={`${day}: ${n}`}>
              <div
                className={`w-full rounded-t ${n > 20 ? "bg-accent" : "bg-primary"}`}
                style={{ height: `${(n / maxDay) * 100}%`, minHeight: n > 0 ? "2px" : "0" }}
              />
              <span className="text-[10px] text-muted-foreground">{day.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <Breakdown
        title="By what's wrong with their web presence"
        note="The most useful cut: it says which opening line earns a reply. A dead domain is a fact the owner can check in seconds; 'not mobile-friendly' is a judgement they may disagree with."
        rows={stats.byDefect}
      />

      <Breakdown
        title="No website vs poor website"
        note="Whether it's better to pitch someone with nothing at all or someone with something broken."
        rows={stats.byReason}
      />

      <Breakdown
        title="By category"
        note="Which trades reply. Worth checking before adding more saved searches in the same niche."
        rows={stats.byCategory}
      />

      <p className="text-xs text-muted-foreground">
        Reply figures depend on prospect status being kept up to date — nothing detects a reply automatically, so a
        prospect only counts as replied once it's marked that way on the Outreach page. If these numbers look low,
        check that first before concluding the outreach isn't working.
      </p>
    </div>
  );
}
