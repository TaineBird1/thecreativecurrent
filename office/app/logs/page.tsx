"use client";

import { useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Header } from "../components/Header";
import { Card, Empty, Pill, relativeTime } from "../components/ui";

/**
 * Every LLM call and every tool call.
 *
 * Free does not mean invisible. The point of this screen is that you can see
 * exactly what nine bots did with a shared quota of ~1,500 requests a day, and
 * spot the bot that has started looping before it eats the whole thing.
 */
export default function LogsPage() {
  const [botKey, setBotKey] = useState("");
  const [tab, setTab] = useState<"llm" | "tools" | "runs">("llm");

  const bots = useAuthedQuery(api.bots.list);
  const summary = useAuthedQuery(api.logs.llmSummary);
  const usage = useAuthedQuery(api.rate.usageToday);
  const llm = useAuthedQuery(api.logs.llm, { botKey: botKey || undefined, limit: 200 });
  const tools = useAuthedQuery(api.logs.tools, { botKey: botKey || undefined, limit: 200 });
  const runs = useAuthedQuery(api.runs.recent, { limit: 150 });
  const oldWording = useAuthedQuery(api.emails.sentWithOldWording);

  const filteredRuns = (runs ?? []).filter((r) => !botKey || r.botKey === botKey);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="calls (last 1000)" value={summary?.calls} />
          <Stat label="ok" value={summary?.ok} tone="good" />
          <Stat label="rate limited" value={summary?.rateLimited} tone="warn" />
          <Stat label="fell back to Groq" value={summary?.fallbacks} tone="warn" />
          <Stat label="tokens" value={summary?.tokens} />
          <Stat label="avg latency" value={summary ? `${summary.avgLatencyMs}ms` : undefined} />
        </div>

        {oldWording && oldWording.findings.length > 0 && (
          <Card className="border-rust/40 p-4">
            <p className="mb-1 text-xs font-semibold text-rust">
              {oldWording.findings.length} sent email
              {oldWording.findings.length === 1 ? "" : "s"} went out with wording since fixed
            </p>
            <p className="mb-3 text-[11px] leading-relaxed text-faint">
              Checked all {oldWording.checked} sent emails for things a recipient can actually see.
              Nothing here is automatic — whether any of these deserves a one-line correction from
              your own inbox is your call.
            </p>
            <div className="space-y-2">
              {oldWording.findings.map((f) => (
                <details key={f.id} className="rounded-lg border border-edge bg-ink p-2.5">
                  <summary className="cursor-pointer text-xs">
                    <span className="font-medium text-cream">{f.businessName}</span>
                    <span className="text-faint"> · {f.to} · {relativeTime(f.sentAt)}</span>
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {f.problems.map((p) => (
                      <li key={p} className="text-[11px] text-lamp">
                        — {p}
                      </li>
                    ))}
                  </ul>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-edge bg-panel p-2 text-[11px] leading-relaxed text-muted">
                    {f.body}
                  </pre>
                </details>
              ))}
            </div>
          </Card>
        )}

        {usage && (
          <Card className="p-4">
            <p className="mb-3 text-xs text-faint">
              Today&apos;s free-tier budget — {usage.totalUsed} of {usage.totalLimit} requests used.
              Gemini&apos;s free tier is roughly 1,500 a day across everything.
            </p>
            <div className="space-y-1.5">
              {usage.perBot.map((b) => {
                const bot = bots?.find((x) => x.key === b.botKey);
                const pct = Math.min(100, (b.used / Math.max(1, b.limit)) * 100);
                return (
                  <div key={b.botKey} className="flex items-center gap-2 text-[11px]">
                    <span className="w-28 shrink-0 truncate text-muted">
                      {bot?.avatar} {bot?.name ?? b.botKey}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, background: pct >= 100 ? "#f0603c" : "#ffb547" }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-faint">
                      {b.used}/{b.limit}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {(["llm", "tools", "runs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs uppercase ${
                tab === t ? "bg-panel text-cream" : "text-faint hover:text-cream"
              }`}
            >
              {t}
            </button>
          ))}
          <select
            value={botKey}
            onChange={(e) => setBotKey(e.target.value)}
            className="ml-auto rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none"
          >
            <option value="">All bots</option>
            {bots?.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {tab === "llm" && (
          <Table
            head={["bot", "purpose", "provider", "model", "tokens", "latency", "status", "when"]}
            rows={(llm ?? []).map((c) => [
              c.botKey,
              c.purpose,
              <span key="p" className="flex gap-1">
                <Pill tone={c.provider === "gemini" ? "info" : "warn"}>{c.provider}</Pill>
                {c.fellBack && <Pill tone="warn">fallback</Pill>}
              </span>,
              c.model,
              String(c.totalTokens),
              `${c.latencyMs}ms`,
              <Pill key="s" tone={c.status === "ok" ? "good" : c.status === "rate_limited" ? "warn" : "bad"}>
                {c.error ? `${c.status}: ${c.error.slice(0, 60)}` : c.status}
              </Pill>,
              relativeTime(c.createdAt),
            ])}
          />
        )}

        {tab === "tools" && (
          <Table
            head={["bot", "tool", "what it was looking for", "status", "took", "when"]}
            rows={(tools ?? []).map((t) => [
              t.botKey,
              t.tool,
              // The second line is the whole point of this tab and was being
              // dropped on the floor. Lead-gen writes a sentence per directory
              // search saying how many links were on the page, how many looked
              // like businesses, the HTTP status and a sample of the paths —
              // written, in its own words, so that "a directory redesigned" is
              // distinguishable from "no leads today". None of it was rendered,
              // so every failing source looked identical: an amber "blocked"
              // and nothing else.
              <div key="a" className="min-w-0">
                <span className="block">{t.args.slice(0, 120)}</span>
                {(t.error ?? t.result) && (
                  <span
                    className={`mt-0.5 block text-[11px] leading-snug ${
                      t.error ? "text-rust" : "text-faint"
                    }`}
                  >
                    {(t.error ?? t.result ?? "").slice(0, 400)}
                  </span>
                )}
              </div>,
              <Pill key="s" tone={t.status === "ok" ? "good" : t.status === "blocked" ? "warn" : "bad"}>
                {/* "blocked" is the stored value and the wrong word to show: it
                    is written when the fetch succeeded and nothing on the page
                    looked like a business, not when anyone refused us. Read as
                    "they are blocking the scraper" it sends you to fix the
                    wrong thing entirely. */}
                {t.status === "blocked" ? "nothing matched" : t.status}
              </Pill>,
              `${t.durationMs}ms`,
              relativeTime(t.createdAt),
            ])}
          />
        )}

        {tab === "runs" && (
          <Table
            head={["bot", "trigger", "status", "summary", "when"]}
            rows={filteredRuns.map((r) => [
              r.botKey,
              r.trigger,
              <Pill key="s" tone={r.status === "ok" ? "good" : r.status === "error" ? "bad" : "warn"}>
                {r.status}
              </Pill>,
              r.summary ?? r.error ?? "—",
              relativeTime(r.startedAt),
            ])}
          />
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number | string;
  tone?: "good" | "warn";
}) {
  return (
    <Card className="p-3">
      <p
        className={`font-mono text-lg font-semibold ${
          tone === "good" ? "text-lime" : tone === "warn" ? "text-lamp" : "text-cream"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString("en-ZA") : (value ?? "—")}
      </p>
      <p className="text-[11px] text-faint">{label}</p>
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <Empty>Nothing logged yet.</Empty>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-edge">
      <table className="w-full min-w-[820px] text-xs">
        <thead className="bg-panel-2/60 text-left text-[11px] uppercase tracking-wider text-faint">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-edge/50 bg-panel">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 align-top text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
