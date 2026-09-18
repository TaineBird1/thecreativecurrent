"use client";

import { useAuthedMutation, useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, Pill, relativeTime } from "../components/ui";

/**
 * The call list.
 *
 * Around half of every qualified lead has a phone number and no address that
 * can be written to — Google Maps has no email field, and a small Durban trade
 * very often publishes a number and nothing else. Lerato only sends email, so
 * those leads sat qualified, scored, in the list, and touched by nothing.
 *
 * Built for one hand on a phone: the number is the thing you reach for, one tap
 * opens WhatsApp, and saying what happened is a single click. A form that takes
 * longer to fill in than the call took is a form nobody fills in, and a call
 * list nobody updates is a worse lie than no call list at all.
 */

const OUTCOMES = [
  { key: "no_answer", label: "No answer" },
  { key: "left_message", label: "Left a message" },
  { key: "spoke", label: "Spoke to them" },
  { key: "call_back", label: "Call back" },
  { key: "meeting_booked", label: "Booked a call" },
  { key: "not_interested", label: "Not interested" },
  { key: "wrong_number", label: "Wrong number" },
];

type Queue = FunctionReturnType<typeof api.calls.queue>;

/**
 * The facts a demo site needs, in the shape demo/businesses.json wants.
 *
 * Every one of these is already in the database, and until now the way it
 * reached the demo builder was a screenshot of this page, read back by eye.
 * Phone numbers transcribed off an image is exactly the kind of quiet error
 * that ends with a prospect opening a page whose call button rings someone
 * else.
 *
 * Only the facts. The headline, the services and the reasons are writing, and
 * writing them from a category name is how the first six ended up plausible
 * rather than true — so this leaves those fields out entirely rather than
 * filling them with something that looks finished.
 */
function demoDetails(rows: Queue): string {
  return JSON.stringify(
    rows.map((row) => {
      const lead = row.lead;
      return {
        slug: lead.businessName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40),
        name: lead.businessName,
        trade: lead.category,
        suburb: lead.suburb,
        phone: lead.mobile !== "not_found" ? lead.mobile : lead.landline,
        secondNumber:
          lead.mobile !== "not_found" && lead.landline !== "not_found" ? lead.landline : undefined,
        score: lead.score,
        website: lead.websiteUrl,
        // What is true about their web presence, so the pitch on the page
        // matches the pitch on the call.
        situation: row.mention ?? undefined,
      };
    }),
    null,
    2,
  );
}



export default function CallsPage() {
  const [includeDone, setIncludeDone] = useState(false);
  const queue = useAuthedQuery(api.calls.queue, { includeDone });
  const counts = useAuthedQuery(api.calls.counts);
  const [copied, setCopied] = useState("");
  // Which businesses already have a demo page, read from the demo folder
  // itself. Without it the button kept offering the four at the top of the
  // queue — which are the ones already built, since building a demo is not
  // ringing anybody and the queue orders by who has not been rung.
  const [built, setBuilt] = useState<string[]>([]);
  useEffect(() => {
    fetch("/demo/built.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((slugs) => Array.isArray(slugs) && setBuilt(slugs))
      .catch(() => {
        /* no demos deployed yet, or an old build — offer everything */
      });
  }, []);
  // Shown when the clipboard is unavailable, which it is in a lot of mobile
  // browsers. A button that silently does nothing is worse than no button.
  const [fallback, setFallback] = useState("");

  const slugOf = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  const waitingForADemo = (queue ?? []).filter(
    (r) => r.attempts === 0 && !built.includes(slugOf(r.lead.businessName)),
  );

  const copyDemoDetails = async (howMany: number) => {
    const next = waitingForADemo.slice(0, howMany);
    if (next.length === 0) {
      setCopied("Every never-rung lead already has a demo page.");
      return;
    }
    const text = demoDetails(next);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${next.length} copied — paste it into the chat.`);
      setFallback("");
      setTimeout(() => setCopied(""), 4000);
    } catch {
      setFallback(text);
      setCopied("Could not reach the clipboard — select the text below instead.");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <Card className="p-3">
          <h1 className="text-sm font-semibold text-cream">Who to ring</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            Every one of these has a phone number and no address anyone can write to. Nothing else
            in the office will ever touch them — no bot dials, and no bot decides. Tap the number,
            have the conversation, then say what happened so the next call starts where this one
            ended.
          </p>
          {counts && (
            <div className="mt-2.5 flex flex-wrap gap-3 text-[11px] text-faint">
              <span>
                <b className="font-mono text-cream">{counts.toCall}</b> to ring
              </span>
              <span>
                · <b className="font-mono text-cream">{counts.neverRung}</b> never tried
              </span>
              <span>
                · <b className="font-mono text-cream">{counts.callsThisWeek}</b> calls this week
              </span>
              <span>
                · <b className="font-mono text-lime">{counts.booked}</b> booked
              </span>
              <button
                onClick={() => setIncludeDone((v) => !v)}
                className="text-lamp underline decoration-dotted underline-offset-2"
              >
                · {includeDone ? "hide the ones that are done" : "show the ones that are done"}
              </button>
            </div>
          )}
        </Card>

        <Card className="flex flex-wrap items-center gap-3 p-3 text-xs">
          <span className="text-faint">Building demo sites for the next few?</span>
          {[4, 8].map((n) => (
            <Button key={n} tone={n === 4 ? "primary" : "default"} onClick={() => copyDemoDetails(n)}>
              Copy the next {n}
            </Button>
          ))}
          <span className="min-w-0 flex-1 leading-relaxed text-faint">
            {copied ||
              `${waitingForADemo.length} never-rung lead${waitingForADemo.length === 1 ? "" : "s"} without a demo page${
                built.length ? `, ${built.length} already built` : ""
              }. The facts only — what the page actually says still has to be written.`}
          </span>
        </Card>

        {fallback && (
          <Card className="p-3">
            <textarea
              readOnly
              value={fallback}
              rows={12}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-edge bg-ink p-3 font-mono text-[11px] leading-relaxed outline-none"
            />
          </Card>
        )}

        {queue?.length === 0 && (
          <Empty>
            Nobody to ring. Every lead with a phone number either has an address Lerato can use, or
            has already been dealt with.
          </Empty>
        )}

        {queue?.map((row) => <CallRow key={row.lead._id} row={row} />)}
      </main>
    </div>
  );
}

function CallRow({ row }: { row: Queue[number] }) {
  const log = useAuthedMutation(api.calls.log);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { lead, last, attempts, waiting, dueAt } = row;
  const number = lead.mobile !== "not_found" ? lead.mobile : lead.landline;
  const whatsapp = lead.mobile !== "not_found" ? lead.mobile.replace("+", "") : null;

  const record = async (outcome: string) => {
    setBusy(true);
    setError("");
    try {
      await log({
        leadId: lead._id,
        outcome: outcome as never,
        note,
        // A call back with no time agreed is worth chasing tomorrow.
        callBackAt: outcome === "call_back" ? Date.now() + 24 * 3_600_000 : undefined,
      });
      setNote("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`p-3 ${waiting ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-cream">{lead.businessName}</span>
            <Pill tone={lead.score >= 80 ? "good" : "neutral"}>{lead.score}</Pill>
            {attempts > 0 && (
              <span className="text-[11px] text-faint">
                {attempts} {attempts === 1 ? "call" : "calls"}
                {last ? ` · ${last.outcome.replace(/_/g, " ")} ${relativeTime(last.createdAt)}` : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] text-faint">
            {lead.category} · {lead.suburb}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <a
            href={`tel:${number}`}
            className="rounded-lg border border-edge px-2.5 py-1.5 font-mono text-xs text-cream hover:border-lamp"
          >
            {number}
          </a>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-lime/15 px-2.5 py-1.5 text-xs text-lime hover:bg-lime/25"
            >
              WhatsApp
            </a>
          )}
          <Button tone={open ? "default" : "primary"} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "Log a call"}
          </Button>
        </div>
      </div>

      {/* Decided in the query, because whether a fault is about the business
          at all depends on whether the audited site was theirs. */}
      {row.mention && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          <span className="text-faint">Worth mentioning: </span>
          {row.mention}
        </p>
      )}

      {waiting && dueAt && (
        <p className="mt-1.5 text-[11px] text-faint">
          Resting until{" "}
          {new Date(dueAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.
        </p>
      )}

      {last?.note && (
        <p className="mt-1.5 rounded-lg border border-edge bg-panel-2/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
          Last time: {last.note}
        </p>
      )}

      {open && (
        <div className="mt-2.5 space-y-2 border-t border-edge/60 pt-2.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="What did they say? Optional — but it is what you will want in front of you next time."
            className="w-full rounded-lg border border-edge bg-ink p-2.5 text-xs outline-none focus:border-lamp"
          />
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                disabled={busy}
                onClick={() => record(o.key)}
                className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-muted transition hover:border-lamp hover:text-cream disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </div>
          {error && <p className="text-[11px] text-rust">{error}</p>}
        </div>
      )}
    </Card>
  );
}
