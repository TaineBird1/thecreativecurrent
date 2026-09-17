"use client";

import { useAuthedAction, useAuthedMutation, useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, Pill, relativeTime } from "../components/ui";
import type { Id } from "@/convex/_generated/dataModel";
import { SOURCE_BY_ID } from "@shared/tools/sources";

const STATUSES = [
  "qualified", "contacted", "replied", "interested", "call_booked",
  "won", "not_now", "no", "lost", "discarded",
] as const;

/**
 * Leads.
 *
 * Detail opens in a side panel driven by a query param rather than a dynamic
 * route, because `output: export` would need every lead id known at build time —
 * and lead ids are, by definition, not known at build time.
 */
export default function LeadsPage() {
  const [status, setStatus] = useState<string>("");
  const [tier, setTier] = useState<number>(0);
  const [search, setSearch] = useState("");
  // Either pile is otherwise a hunt through ninety-odd rows for six.
  const [focus, setFocus] = useState<"" | "waiting" | "call" | "directory">("");
  const [selected, setSelected] = useState<Id<"leads"> | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const leads = useAuthedQuery(api.leads.list, {
    status: (status || undefined) as never,
    tier: (tier || undefined) as never,
    search: search || undefined,
    limit: 300,
  });
  const counts = useAuthedQuery(api.leads.counts);
  const waitingOnAddress = useAuthedQuery(api.leads.waitingOnAddress);
  const callable = useAuthedQuery(api.leads.callable);
  const sourceHealth = useAuthedQuery(api.leads.sourceHealth);
  const directoryAddresses = useAuthedQuery(api.leads.directoryAddresses);
  const [showSources, setShowSources] = useState(false);
  const addByUrl = useAuthedAction(api.agents.leadgen.addByUrl);
  const runNow = useAuthedAction(api.agents.leadgen.runNow);
  const recheckGuessed = useAuthedAction(api.agents.leadgen.recheckGuessed);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1500px] space-y-3 p-4">
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, suburb, trade…"
            className="min-w-[180px] flex-1 rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs outline-none focus:border-lamp"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value))}
            className="rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none"
          >
            <option value={0}>Any tier</option>
            <option value={1}>Tier 1 — trades</option>
            <option value={2}>Tier 2 — solar</option>
            <option value={3}>Tier 3 — guest houses</option>
          </select>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setResult("");
              try {
                setResult(await runNow({}));
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Looking…" : "Find leads now"}
          </Button>
        </Card>

        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-faint">Or hand Sipho one directly:</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://their-site.co.za or a Facebook page"
            className="min-w-[240px] flex-1 rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs outline-none focus:border-lamp"
          />
          <Button
            tone="primary"
            disabled={busy || !url.trim()}
            onClick={async () => {
              setBusy(true);
              setResult("");
              try {
                setResult(await addByUrl({ url: url.trim() }));
                setUrl("");
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Enrich &amp; audit
          </Button>
        </Card>

        {result && <p className="px-1 text-xs text-cream">{result}</p>}

        {counts && (
          <div className="flex flex-wrap gap-2 px-1 text-[11px] text-faint">
            <span>{counts.total} total</span>
            <span>· {counts.qualified} qualified</span>
            <span>· {counts.contacted} contacted</span>
            <span>· {counts.replied + counts.interested} replied</span>
            <span>· {counts.discarded} discarded off-niche</span>
            {/* Both of these are otherwise invisible: qualified, in the list,
                and silently never written to by anything. */}
            {waitingOnAddress ? (
              <FocusToggle
                on={focus === "waiting"}
                onClick={() => setFocus((f) => (f === "waiting" ? "" : "waiting"))}
              >
                {waitingOnAddress} waiting on you to check a guessed address
              </FocusToggle>
            ) : null}
            {callable?.length ? (
              <FocusToggle
                on={focus === "call"}
                onClick={() => setFocus((f) => (f === "call" ? "" : "call"))}
              >
                {callable.length} to phone — no email to be found
              </FocusToggle>
            ) : null}
            {directoryAddresses?.length ? (
              <FocusToggle
                on={focus === "directory"}
                onClick={() => setFocus((f) => (f === "directory" ? "" : "directory"))}
              >
                <span className="text-rust">
                  {directoryAddresses.length} with a Facebook page or directory in place of their
                  own site — check before sending
                </span>
              </FocusToggle>
            ) : null}
            <FocusToggle
              on={showSources}
              onClick={() => setShowSources((v) => !v)}
              whenOn=""
            >
              where they come from
            </FocusToggle>
          </div>
        )}

        {showSources && <SourceHealth rows={sourceHealth} />}


        {/* Only where the pile it works on is the thing on screen. */}
        {focus === "waiting" && (
          <Card className="flex flex-wrap items-center gap-3 p-3 text-xs">
            <Button
              tone="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setResult(await recheckGuessed({}));
                } catch (err) {
                  setResult(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Looking…" : "Look again for these addresses"}
            </Button>
            <span className="min-w-0 flex-1 leading-relaxed text-faint">
              Every one of these was found when Sipho read a homepage and one contact page. He can
              read their contact and about pages, the usual addresses nothing links to, and their
              sitemap. Whatever he finds published goes straight into the queue; whatever he
              doesn&apos;t is a business that publishes nothing, and that is worth knowing too.
            </span>
          </Card>
        )}

        {leads?.length === 0 && (
          <Empty>
            No leads match. Sipho runs every weekday at 08:00 — or paste a business URL above.
          </Empty>
        )}

        <div className="overflow-x-auto rounded-2xl border border-edge">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-panel-2/60 text-left text-[11px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Faults</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last touch</th>
              </tr>
            </thead>
            <tbody>
              {leads
                ?.filter((lead) =>
                  focus === "directory"
                    ? directoryAddresses?.some((l) => l._id === lead._id) === true
                    : focus === "waiting"
                    ? lead.emailStatus === "inferred"
                    : focus === "call"
                      ? lead.status === "qualified" &&
                        lead.emailStatus === "not_found" &&
                        (lead.mobile !== "not_found" || lead.landline !== "not_found")
                      : true,
                )
                .map((lead) => (
                <tr
                  key={lead._id}
                  onClick={() => setSelected(lead._id)}
                  className="cursor-pointer border-t border-edge/60 bg-panel hover:bg-panel-2"
                >
                  <td className="px-3 py-2">
                    <span className="block font-medium text-cream">{lead.businessName}</span>
                    <span className="text-[11px] text-faint">
                      {lead.category} · {lead.suburb}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-faint">{lead.tier}</td>
                  <td className="px-3 py-2">
                    <span className={lead.score >= 70 ? "text-lime" : lead.score >= 40 ? "text-lamp" : "text-faint"}>
                      {lead.score}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ContactDots lead={lead} />
                  </td>
                  <td className="px-3 py-2 text-faint">
                    {lead.hasWebsite ? `${lead.faults.length} found` : "no website"}
                  </td>
                  <td className="px-3 py-2">
                    <Pill
                      tone={
                        ["won", "interested", "call_booked"].includes(lead.status)
                          ? "good"
                          : ["no", "lost", "discarded"].includes(lead.status)
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {lead.status.replace(/_/g, " ")}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 text-faint">
                    {lead.lastTouchAt ? relativeTime(lead.lastTouchAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {selected && <LeadPanel id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

type Lead = NonNullable<FunctionReturnType<typeof api.leads.list>>[number];

/** At a glance: which of the four contact channels we actually have. */
function ContactDots({ lead }: { lead: Lead }) {
  const channels = [
    { key: "mob", has: lead.mobile !== "not_found", title: lead.mobile },
    { key: "tel", has: lead.landline !== "not_found", title: lead.landline },
    {
      key: "@",
      has: lead.email !== "not_found",
      title: `${lead.email}${lead.emailStatus === "inferred" ? " (inferred, not verified)" : ""}`,
    },
    { key: "fb", has: lead.facebookUrl !== "not_found", title: lead.facebookUrl },
  ];
  return (
    <span className="flex gap-1">
      {channels.map((c) => (
        <span
          key={c.key}
          title={c.has ? c.title : "not found"}
          className={`rounded px-1 py-0.5 text-[10px] ${
            c.has
              ? c.key === "@" && lead.emailStatus === "inferred"
                ? "bg-lamp/15 text-lamp"
                : "bg-lime/15 text-lime"
              : "bg-edge text-faint line-through"
          }`}
        >
          {c.key}
        </span>
      ))}
    </span>
  );
}

function LeadPanel({ id, onClose }: { id: Id<"leads">; onClose: () => void }) {
  const detail = useAuthedQuery(api.leads.byId, { id });
  const setStatus = useAuthedMutation(api.leads.setStatus);
  const confirmEmail = useAuthedMutation(api.leads.confirmEmail);
  const noEmailPublished = useAuthedMutation(api.leads.noEmailPublished);
  const logReply = useAuthedAction(api.agents.outreach.logReply);
  const draftProposal = useAuthedAction(api.agents.proposal.draft);

  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  if (!detail) return null;
  const { lead, events, emails, sequence } = detail;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
      <div className="thin-scroll relative h-full w-full max-w-2xl overflow-y-auto border-l border-edge bg-panel p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{lead.businessName}</h2>
            <p className="text-xs text-muted">
              Tier {lead.tier} · {lead.category} · {lead.suburb} · scored {lead.score}
            </p>
          </div>
          <Button tone="ghost" onClick={onClose}>✕</Button>
        </div>

        {lead.discardReason && (
          <p className="mb-4 rounded-lg border border-rust/30 bg-rust/5 px-3 py-2 text-xs text-rust">
            Discarded: {lead.discardReason}
          </p>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">Contact</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Field label="Contact person" value={lead.contactName} />
            <Field
              label="Mobile"
              value={lead.mobile}
              href={lead.mobile !== "not_found" ? `https://wa.me/${lead.mobile.replace("+", "")}` : undefined}
              hint={lead.mobile !== "not_found" ? "opens WhatsApp" : undefined}
            />
            <Field label="Landline" value={lead.landline} href={lead.landline !== "not_found" ? `tel:${lead.landline}` : undefined} />
            <Field
              label="Email"
              value={lead.email}
              href={lead.email !== "not_found" ? `mailto:${lead.email}` : undefined}
              hint={lead.emailStatus === "inferred" ? "guessed — nobody writes here yet" : undefined}
            />
            <Field label="Website" value={lead.websiteUrl} href={lead.websiteUrl !== "not_found" ? lead.websiteUrl : undefined} />
            <Field label="Facebook" value={lead.facebookUrl} href={lead.facebookUrl !== "not_found" ? lead.facebookUrl : undefined} />
            <Field label="Address" value={lead.address} />
            <Field label="Found on" value={lead.source} href={lead.sourceUrl} />
          </dl>

          {lead.emailStatus === "inferred" && (
            <ConfirmAddress
              lead={lead}
              onConfirm={(email) => confirmEmail({ id: lead._id, email })}
              onNotPublished={() => noEmailPublished({ id: lead._id })}
            />
          )}
        </section>

        {lead.faults.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">
              What&apos;s wrong with their site
            </h3>
            <div className="space-y-1.5">
              {lead.faults.map((f, i) => (
                <div key={i} className="flex gap-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2">
                  <Pill tone={f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "neutral"}>
                    {f.severity}
                  </Pill>
                  <span className="min-w-0 flex-1 text-xs leading-snug">{f.detail}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">
              These are written so Lerato can quote one straight into an email.
            </p>
          </section>
        )}

        {lead.facebookActivity && (
          <section className="mb-5">
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">
              What their Facebook page does instead
            </h3>
            <p className="text-xs leading-relaxed text-muted">{lead.facebookActivity}</p>
          </section>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">
            Email thread {sequence ? `· sequence ${sequence.step}/3${sequence.stopped ? " (stopped)" : ""}` : ""}
          </h3>
          {emails.length === 0 && <p className="text-xs text-faint">Nothing sent yet.</p>}
          {emails.map((e) => (
            <div key={e._id} className="mb-2 rounded-lg border border-edge bg-panel-2/40 p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[11px]">
                <Pill
                  tone={
                    e.status === "sent" ? "good" : e.status === "blocked" ? "warn" : e.status === "failed" ? "bad" : "info"
                  }
                >
                  {e.direction === "in" ? "reply" : e.status}
                </Pill>
                <span className="font-medium text-cream">{e.subject}</span>
                <span className="ml-auto text-faint">{relativeTime(e.createdAt)}</span>
              </div>
              {e.error && <p className="mb-1.5 text-[11px] text-lamp">{e.error}</p>}
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{e.body}</p>
            </div>
          ))}
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">They replied</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            Replies land in your own inbox — there is no free inbound email API, so nothing reads
            them automatically. Paste one here and Lerato classifies it, stops the sequence, and
            drafts an answer.
          </p>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Paste what they wrote back…"
            className="w-full rounded-lg border border-edge bg-ink p-3 text-xs outline-none focus:border-lamp"
          />
          <Button
            tone="primary"
            className="mt-2"
            disabled={busy || !reply.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await logReply({ leadId: id, body: reply }));
                setReply("");
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Log the reply
          </Button>
        </section>

        <section className="mb-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">
            Had the call? Paste your notes
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What they want, what they've got, what they said about budget…"
            className="w-full rounded-lg border border-edge bg-ink p-3 text-xs outline-none focus:border-lamp"
          />
          <Button
            className="mt-2"
            disabled={busy || !notes.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await draftProposal({ callNotes: notes, leadId: id }));
                setNotes("");
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Draft a proposal (goes to Approvals)
          </Button>
        </section>

        {result && (
          <p className="mb-4 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs text-cream">
            {result}
          </p>
        )}

        <section className="mb-5">
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">Move it</h3>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Button
                key={s}
                tone={lead.status === s ? "primary" : "default"}
                onClick={() => setStatus({ id, status: s as never })}
              >
                {s.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-wider text-faint">History</h3>
          {events.map((e) => (
            <div key={e._id} className="border-b border-edge/40 py-1.5 text-[11px] last:border-0">
              <span className="text-faint">{relativeTime(e.createdAt)} · {e.botKey}</span>
              <span className="block text-muted">{e.detail}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  /**
   * Optional because `leads.contactName` is. Every other contact column is a
   * required string carrying the literal "not_found" when nothing was found —
   * this one column is genuinely absent instead, and both mean the same thing
   * to a reader, so both render as "not found".
   */
  value: string | undefined;
  href?: string;
  hint?: string;
}) {
  const missing = !value || value === "not_found";
  return (
    <div>
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd className={missing ? "text-faint italic" : "text-cream"}>
        {missing ? (
          "not found"
        ) : href ? (
          <a href={href} target="_blank" rel="noreferrer" className="break-all underline decoration-edge-2 hover:decoration-lamp">
            {value}
          </a>
        ) : (
          <span className="break-all">{value}</span>
        )}
        {hint && <span className="ml-1 text-[10px] text-lamp">({hint})</span>}
      </dd>
    </div>
  );
}

/**
 * A guessed address, and the one action that unblocks it.
 *
 * Lead-gen guesses `info@theirdomain.co.za` when nothing is published, and
 * Outreach will not write to a guess — a bounce is a wasted lead and a dent in
 * a new sending domain's reputation. So the lead waits here until someone has
 * actually looked at the site, the Facebook page, or picked up the phone.
 *
 * Confirming is a person saying they checked. Nothing here verifies anything,
 * and the wording does not pretend otherwise.
 */
/** A count in the summary row that doubles as a filter. */
function FocusToggle({
  on,
  onClick,
  children,
  whenOn = " — showing only these",
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  whenOn?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`underline decoration-dotted underline-offset-2 ${on ? "text-cream" : "text-lamp"}`}
    >
      · {children}
      {on ? whenOn : ""}
    </button>
  );
}

/**
 * Which directories are worth searching, judged on the only thing that decides
 * it: how often a lead from there carries an email we may actually write to.
 *
 * A source can look productive on lead count alone and still be feeding the
 * pipeline businesses Outreach can never contact — which is exactly what
 * twenty-four uncontactable qualified leads turned out to be. Coverage and
 * emailable rate side by side is what tells those apart.
 */
function SourceHealth({
  rows,
}: {
  rows: FunctionReturnType<typeof api.leads.sourceHealth> | undefined;
}) {
  if (!rows?.length) return null;

  return (
    <Card className="p-3">
      <table className="w-full text-xs">
        <thead className="text-left text-[11px] uppercase tracking-wider text-faint">
          <tr>
            <th className="pb-1.5 pr-3">Source</th>
            <th className="pb-1.5 pr-3">Leads</th>
            <th className="pb-1.5 pr-3">Emailable</th>
            <th className="pb-1.5 pr-3">Published</th>
            <th className="pb-1.5 pr-3">Guessed</th>
            <th className="pb-1.5 pr-3">No email</th>
            <th className="pb-1.5">Has a phone</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-t border-edge/60">
              <td className="py-1.5 pr-3 font-medium text-cream">
                {SOURCE_BY_ID[r.source]?.label ?? r.source}
              </td>
              <td className="py-1.5 pr-3 text-muted">{r.total}</td>
              <td className="py-1.5 pr-3">
                <span
                  className={
                    r.emailable >= 60 ? "text-lime" : r.emailable >= 25 ? "text-lamp" : "text-rust"
                  }
                >
                  {r.emailable}%
                </span>
              </td>
              <td className="py-1.5 pr-3 text-muted">{r.published}</td>
              <td className="py-1.5 pr-3 text-muted">{r.inferred}</td>
              <td className="py-1.5 pr-3 text-muted">{r.none}</td>
              <td className="py-1.5 text-muted">{r.withPhone}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Emailable is the share carrying an address published on their own site — the only kind
        Lerato writes to. A source low here is still finding real businesses; it is just finding
        ones only a phone call can reach, and it costs a run every morning either way.
      </p>
    </Card>
  );
}

function ConfirmAddress({
  lead,
  onConfirm,
  onNotPublished,
}: {
  lead: { email: string; websiteUrl: string; mobile: string; landline: string };
  onConfirm: (email: string) => Promise<unknown>;
  /** The third answer: looked, and there is nothing to find. */
  onNotPublished: () => Promise<unknown>;
}) {
  const [email, setEmail] = useState(lead.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasPhone = lead.mobile !== "not_found" || lead.landline !== "not_found";

  return (
    <div className="mt-3 rounded-lg border border-lamp/30 bg-lamp/5 p-3">
      <p className="mb-1 text-xs font-semibold text-lamp">Guessed address — held back</p>
      <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
        Nothing was published on their site, so this was guessed from the domain. Lerato will not
        write to it until you say it is right — a bounce costs the lead and the sending domain&apos;s
        reputation.{" "}
        {lead.websiteUrl !== "not_found" && (
          <a
            href={lead.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-edge-2 hover:decoration-lamp"
          >
            Open their site
          </a>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs outline-none focus:border-lamp"
        />
        <Button
          tone="primary"
          disabled={busy || !email.includes("@")}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm(email);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {email.trim().toLowerCase() === lead.email ? "Confirm" : "Use this instead"}
        </Button>
      </div>
      {/* Without this the only outcomes on offer were "the guess is right" and
          "here is the right one", and the one people actually reach — there is
          no address on the site at all — had nowhere to go, so the check they
          had just done went unrecorded and got asked for again tomorrow. */}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onNotPublished();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
        className="mt-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-cream disabled:opacity-50"
      >
        No email anywhere on their site
      </button>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">
        {hasPhone
          ? "Drops the guess and moves this one to the call list — it stays qualified, it is just a phone call rather than an email."
          : "Drops the guess. With no phone number or Facebook page either there is no way to reach them, so this lead gets discarded — the row stays, so Sipho will not go and find them again."}
      </p>
      {error && <p className="mt-1.5 text-[11px] text-rust">{error}</p>}
    </div>
  );
}
