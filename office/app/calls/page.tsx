"use client";

import { useAuthedMutation, useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
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

export default function CallsPage() {
  const [includeDone, setIncludeDone] = useState(false);
  const queue = useAuthedQuery(api.calls.queue, { includeDone });
  const counts = useAuthedQuery(api.calls.counts);

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
            {lead.hasWebsite ? "" : " · no website at all"}
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

      {/* Something true to open with, from what was measured about their site. */}
      {(lead.faults.length > 0 || !lead.hasWebsite) && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          <span className="text-faint">Worth mentioning: </span>
          {lead.hasWebsite
            ? lead.faults[0]?.detail
            : "they have no website at all — only a Facebook page or a WhatsApp catalogue."}
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
