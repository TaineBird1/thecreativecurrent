"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, PaidStub, Pill, relativeTime } from "../components/ui";

const KINDS = ["blog", "linkedin", "instagram", "newsletter", "video_script", "ad_copy", "proposal", "contract"] as const;

export default function LibraryPage() {
  const drafts = useQuery(api.library.drafts, { limit: 200 });
  const media = useQuery(api.library.media, { limit: 60 });
  const markPosted = useMutation(api.library.markPosted);
  const write = useAction(api.agents.content.write);
  const image = useAction(api.agents.design.image);
  const storyboard = useAction(api.agents.design.storyboard);

  const [tab, setTab] = useState<"drafts" | "media">("drafts");
  const [kind, setKind] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [makeKind, setMakeKind] = useState("blog");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = (drafts ?? []).filter((d) => !kind || d.kind === kind);

  async function go(fn: () => Promise<string>) {
    setBusy(true);
    setResult("");
    try {
      setResult(await fn());
      setBrief("");
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <Card className="p-4">
          <p className="mb-2 text-xs text-faint">
            Ask for something. It lands here as a draft — nothing posts anywhere, ever. That&apos;s
            deliberate: auto-posting is how a brand gets flagged as spam.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={makeKind}
              onChange={(e) => setMakeKind(e.target.value)}
              className="rounded-lg border border-edge bg-ink px-2 py-2 text-xs outline-none"
            >
              {["blog", "linkedin", "instagram", "newsletter", "video_script", "image", "storyboard"].map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What's it about?"
              className="min-w-[240px] flex-1 rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
            />
            <Button
              tone="primary"
              disabled={busy || !brief.trim()}
              onClick={() =>
                go(() =>
                  makeKind === "image"
                    ? image({ brief })
                    : makeKind === "storyboard"
                      ? storyboard({ brief })
                      : write({ kind: makeKind, brief }),
                )
              }
            >
              {busy ? "Working…" : "Make it"}
            </Button>
          </div>
          {result && <p className="mt-2 text-xs text-cream">{result}</p>}
        </Card>

        <PaidStub
          what="Rendered video"
          why="Every free video generator is a trial, a watermark, or a queue that never finishes. Naledi writes shooting scripts and storyboards you can film on a phone instead. If you ever want rendered video, that's a paid API — say the word and it's a small change."
        />

        <div className="flex gap-1">
          {(["drafts", "media"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs capitalize ${
                tab === t ? "bg-panel text-cream" : "text-faint hover:text-cream"
              }`}
            >
              {t}
            </button>
          ))}
          {tab === "drafts" && (
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="ml-auto rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none"
            >
              <option value="">All kinds</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
        </div>

        {tab === "drafts" && (
          <>
            {filtered.length === 0 && <Empty>Nothing here yet.</Empty>}
            {filtered.map((d) => (
              <Card key={d._id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={d.status === "posted_by_boss" ? "good" : d.status === "needs_approval" ? "warn" : "neutral"}>
                    {d.kind.replace(/_/g, " ")}
                  </Pill>
                  <span className="text-sm font-medium">{d.title}</span>
                  <span className="ml-auto text-[11px] text-faint">
                    {d.botKey} · {relativeTime(d.createdAt)}
                  </span>
                </div>
                {d.calendarDate && (
                  <p className="mt-1 text-[11px] text-lamp">scheduled for {d.calendarDate}</p>
                )}
                <p
                  className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted ${
                    open === d._id ? "" : "line-clamp-3"
                  }`}
                >
                  {d.body}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => setOpen(open === d._id ? null : d._id)}>
                    {open === d._id ? "Collapse" : "Read it"}
                  </Button>
                  <Button onClick={() => navigator.clipboard.writeText(d.body)}>Copy</Button>
                  {d.status !== "posted_by_boss" && d.kind !== "proposal" && d.kind !== "contract" && (
                    <Button tone="primary" onClick={() => markPosted({ id: d._id })}>
                      I posted this
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </>
        )}

        {tab === "media" && (
          <>
            {media?.length === 0 && <Empty>No assets yet.</Empty>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {media?.map((m) => (
                <Card key={m._id} className="overflow-hidden">
                  {m.url && (
                    // Free image generation returns a URL, not a file. Kept as a
                    // plain <img> because next/image is off under static export.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.title} className="aspect-video w-full object-cover" loading="lazy" />
                  )}
                  <div className="p-3">
                    <p className="text-xs font-medium">{m.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-faint">{m.prompt}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Pill tone="neutral">{m.provider}</Pill>
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noreferrer" className="text-[11px] text-lamp underline">
                          open full size
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
