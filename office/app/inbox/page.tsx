"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, Pill, relativeTime } from "../components/ui";

/**
 * The Boss inbox: approvals, escalations, and the stand-up history.
 *
 * Approving with an edit uses the edited text — that is the point of editing
 * here rather than sending it back to the bot to rewrite.
 */
export default function InboxPage() {
  const approvals = useQuery(api.approvals.pending);
  const escalations = useQuery(api.escalations.open);
  const history = useQuery(api.approvals.history, { limit: 40 });
  const standups = useQuery(api.standups.recent, { limit: 7 });

  const [tab, setTab] = useState<"approvals" | "escalations" | "standups" | "history">("approvals");

  const tabs = [
    { id: "approvals" as const, label: "Approvals", count: approvals?.length },
    { id: "escalations" as const, label: "Escalations", count: escalations?.length },
    { id: "standups" as const, label: "Stand-ups", count: undefined },
    { id: "history" as const, label: "Decided", count: undefined },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                tab === t.id ? "bg-panel text-cream" : "text-faint hover:text-cream"
              }`}
            >
              {t.label}
              {t.count ? (
                <span className="rounded-full bg-rust px-1.5 text-[10px] font-bold text-white">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "approvals" && (
          <>
            {approvals?.length === 0 && (
              <Empty>
                Nothing waiting on you. Anything touching money — or promising a ranking, a traffic
                number or a timeframe — lands here before it goes anywhere.
              </Empty>
            )}
            {approvals?.map((a) => <ApprovalCard key={a._id} approval={a} />)}
          </>
        )}

        {tab === "escalations" && (
          <>
            {escalations?.length === 0 && <Empty>Nothing escalated. Everyone&apos;s coping.</Empty>}
            {escalations?.map((e) => <EscalationCard key={e._id} escalation={e} />)}
          </>
        )}

        {tab === "standups" && (
          <>
            {standups?.length === 0 && (
              <Empty>No stand-ups yet. Nomsa writes one every morning at 07:00.</Empty>
            )}
            {standups?.map((s) => (
              <Card key={s._id} className="p-5">
                <p className="mb-3 text-xs font-semibold text-lamp">{s.forDate}</p>
                <div className="grid gap-4 text-xs leading-relaxed sm:grid-cols-3">
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">Yesterday</p>
                    <p className="text-muted">{s.yesterday}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">Today</p>
                    <p className="text-muted">{s.today}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">Needs you</p>
                    <p className="text-cream">{s.needsYou}</p>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}

        {tab === "history" && (
          <>
            {history?.length === 0 && <Empty>Nothing decided yet.</Empty>}
            {history?.map((a) => (
              <Card key={a._id} className="flex items-center gap-3 p-3 text-xs">
                <Pill tone={a.status === "approved" ? "good" : "bad"}>{a.status}</Pill>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className="text-faint">{a.decidedAt ? relativeTime(a.decidedAt) : ""}</span>
              </Card>
            ))}
          </>
        )}
      </main>
    </div>
  );
}

type Approval = NonNullable<ReturnType<typeof useQuery<typeof api.approvals.pending>>>[number];
type Escalation = NonNullable<ReturnType<typeof useQuery<typeof api.escalations.open>>>[number];

function ApprovalCard({ approval }: { approval: Approval }) {
  const approveAndExecute = useAction(api.approvals.approveAndExecute);
  const reject = useMutation(api.approvals.reject);

  const [body, setBody] = useState(approval.body);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const edited = body !== approval.body;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-panel-2/40 px-4 py-2.5">
        <Pill tone={approval.guard === "money" ? "warn" : approval.guard === "claims" ? "bad" : "info"}>
          {approval.guard}
        </Pill>
        <span className="text-xs font-medium text-cream">{approval.title}</span>
        <span className="ml-auto text-[11px] text-faint">
          {approval.botKey} · {relativeTime(approval.createdAt)}
        </span>
      </div>

      <div className="px-4 py-3">
        <p className="mb-2 text-xs leading-relaxed text-lamp">{approval.reason}</p>
        {approval.matches.length > 0 && (
          <div className="mb-3 space-y-1">
            {approval.matches.slice(0, 4).map((m, i) => (
              <p
                key={i}
                className="rounded border-l-2 border-lamp/40 bg-ink px-2 py-1 font-mono text-[10.5px] text-muted"
              >
                {m}
              </p>
            ))}
          </div>
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(18, Math.max(6, body.split("\n").length + 1))}
          className="w-full rounded-lg border border-edge bg-ink p-3 text-xs leading-relaxed outline-none focus:border-lamp"
        />
        {edited && <p className="mt-1 text-[11px] text-lamp">Your edit is what will be used.</p>}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="mt-2 w-full rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
        />

        {result && (
          <p className="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-cream">
            {result}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            tone="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await approveAndExecute({
                  id: approval._id,
                  editedBody: edited ? body : undefined,
                  note: note || undefined,
                });
                setResult(r.detail);
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {edited ? "Approve my edit" : "Approve"}
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await reject({ id: approval._id, note: note || undefined });
              } finally {
                setBusy(false);
              }
            }}
          >
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EscalationCard({ escalation }: { escalation: Escalation }) {
  const resolve = useMutation(api.escalations.resolve);
  const [note, setNote] = useState("");

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Pill
          tone={
            escalation.severity === "urgent" ? "bad" : escalation.severity === "warn" ? "warn" : "info"
          }
        >
          {escalation.severity}
        </Pill>
        <span className="text-sm font-medium">{escalation.title}</span>
        <span className="ml-auto text-[11px] text-faint">
          {escalation.botKey} · {relativeTime(escalation.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{escalation.detail}</p>
      <div className="mt-3 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What you did about it (optional)"
          className="flex-1 rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs outline-none focus:border-lamp"
        />
        <Button onClick={() => resolve({ id: escalation._id, note: note || undefined })}>
          Resolved
        </Button>
      </div>
    </Card>
  );
}
