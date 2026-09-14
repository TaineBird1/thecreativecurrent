"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Header } from "./components/Header";
import { Office } from "./components/Office";
import { ActivityFeed } from "./components/ActivityFeed";
import { Pill } from "./components/ui";

export default function OfficePage() {
  const standup = useQuery(api.standups.latest);
  const settings = useQuery(api.settings.get);
  const queue = useQuery(api.scrapeJobs.queueDepth);

  const workerOnline =
    settings?.workerLastSeenAt !== undefined && Date.now() - settings.workerLastSeenAt < 5 * 60_000;

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-edge bg-gradient-to-b from-panel to-ink p-2">
            <Office />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
                workerOnline ? "border-lime/30 text-lime" : "border-edge text-faint"
              }`}
              title="The local Playwright worker runs on your PC and handles screenshots, Google Maps and Facebook. Start it with `pnpm worker`."
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workerOnline ? "bg-lime" : "bg-faint"}`} />
              {workerOnline ? "Local worker online" : "Local worker offline — run `pnpm worker`"}
            </span>

            {queue && queue.queued > 0 && (
              <Pill tone="info">{queue.queued} scrape job(s) queued</Pill>
            )}
            {queue && queue.failed > 0 && <Pill tone="bad">{queue.failed} failed</Pill>}
            {!settings?.senderEmail && (
              <Pill tone="warn">No sender address set — nothing can send</Pill>
            )}
          </div>

          {standup && (
            <section className="rounded-2xl border border-edge bg-panel p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm">🧭</span>
                <h2 className="text-sm font-semibold">This morning&apos;s stand-up</h2>
                <span className="text-[11px] text-faint">{standup.forDate}</span>
              </div>
              <div className="grid gap-4 text-xs leading-relaxed sm:grid-cols-3">
                <StandupBlock title="Yesterday" body={standup.yesterday} />
                <StandupBlock title="Today" body={standup.today} />
                <StandupBlock
                  title="Needs you"
                  body={standup.needsYou}
                  tone={standup.needsYou.trim().toLowerCase().startsWith("nothing") ? "quiet" : "loud"}
                />
              </div>
            </section>
          )}
        </div>

        <aside className="h-[520px] lg:sticky lg:top-[108px] lg:h-[calc(100vh-128px)]">
          <ActivityFeed />
        </aside>
      </main>
    </div>
  );
}

function StandupBlock({
  title,
  body,
  tone = "quiet",
}: {
  title: string;
  body: string;
  tone?: "quiet" | "loud";
}) {
  return (
    <div className={tone === "loud" ? "rounded-lg border border-rust/30 bg-rust/5 p-3" : ""}>
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-faint">{title}</p>
      <p className={tone === "loud" ? "text-cream" : "text-muted"}>{body || "—"}</p>
    </div>
  );
}
