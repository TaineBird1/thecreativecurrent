"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { relativeTime } from "./ui";

const TONE = {
  normal: "border-edge",
  good: "border-lime/40",
  warn: "border-lamp/50",
  bad: "border-rust/50",
} as const;

const DOT = {
  normal: "bg-faint",
  good: "bg-lime",
  warn: "bg-lamp",
  bad: "bg-rust",
} as const;

/**
 * The live feed. Reads the real records (lead events, emails, runs, approvals)
 * rather than a parallel event log, so nothing can happen without showing up
 * here — there is no second place to remember to write to.
 */
export function ActivityFeed() {
  const items = useQuery(api.activity.feed, { limit: 60 });
  const bots = useQuery(api.bots.list);
  const byKey = new Map((bots ?? []).map((b) => [b.key, b]));

  return (
    <div className="flex h-full flex-col rounded-2xl border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          What&apos;s happening
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-faint">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
          live
        </span>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-2">
        {items === undefined && (
          <p className="p-3 text-xs text-faint thinking-dots">Listening</p>
        )}
        {items?.length === 0 && (
          <p className="p-3 text-xs leading-relaxed text-faint">
            Nothing yet. The bots wake up on their own schedules — or open a desk and give one a
            direct instruction.
          </p>
        )}
        {items?.map((item) => {
          const bot = byKey.get(item.botKey);
          return (
            <div
              key={item.id}
              className={`anim-in mb-1 flex gap-2.5 rounded-lg border-l-2 bg-panel-2/40 px-3 py-2 ${TONE[item.tone]}`}
            >
              <span className="mt-1 text-sm leading-none">{bot?.avatar ?? "•"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] leading-snug text-cream">{item.text}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
                  <span className={`h-1 w-1 rounded-full ${DOT[item.tone]}`} />
                  {bot?.name ?? item.botKey} · {relativeTime(item.at)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
