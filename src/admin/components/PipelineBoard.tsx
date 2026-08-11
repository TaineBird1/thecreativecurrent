import { useMemo, useState } from "react";
import { ProspectCard } from "./ProspectCard";
import { IconSearch, IconThumbsUp } from "./icons";
import type { Prospect, ProspectStatus } from "../../lib/prospects";

// Call-queue statuses (new-with-no-draft, no_answer, callback) live in the
// separate Call List page (AdminOutreachCalls.tsx) -- this board mirrors the
// same 7 statuses the old flat-list filter dropdown offered, so nothing that
// used to be visible here disappears.
const PIPELINE_COLUMNS: { status: ProspectStatus; label: string }[] = [
  { status: "new", label: "New" },
  { status: "drafted", label: "Drafted" },
  { status: "approved", label: "Approved" },
  { status: "sent", label: "Sent" },
  { status: "replied", label: "Replied" },
  { status: "won", label: "Won" },
  { status: "lost", label: "Lost" },
];

// Tailwind needs literal class names to find at build time -- interpolating
// a computed tone into a template string would silently produce no styling,
// since nothing in the source would spell out e.g. "bg-green-500" as text.
const columnDot: Record<ProspectStatus, string> = {
  new: "bg-white/30",
  drafted: "bg-orange-400",
  approved: "bg-primary",
  sent: "bg-blue-400",
  replied: "bg-accent",
  won: "bg-green-500",
  lost: "bg-red-400/70",
  no_answer: "bg-white/30",
  callback: "bg-orange-400",
};

export function PipelineBoard({ prospects, onChange }: { prospects: Prospect[]; onChange: () => void }) {
  const [query, setQuery] = useState("");
  const [onlyInterested, setOnlyInterested] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects.filter((p) => {
      if (onlyInterested && p.interested !== true) return false;
      if (q && !p.business_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [prospects, query, onlyInterested]);

  const isFiltering = query.trim() !== "" || onlyInterested;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by business name…"
            className="h-9 w-full rounded-lg border border-border bg-black pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyInterested((v) => !v)}
          aria-pressed={onlyInterested}
          className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
            onlyInterested
              ? "border-green-500/40 bg-green-500/10 text-green-500"
              : "border-border text-muted-foreground hover:border-green-500/40 hover:text-green-500"
          }`}
        >
          <IconThumbsUp className="h-3.5 w-3.5" />
          Interested only
        </button>
        {isFiltering && (
          <span className="text-xs text-muted-foreground">
            Showing {filtered.length} of {prospects.length}
          </span>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_COLUMNS.map((col) => {
          const items = filtered.filter((p) => p.status === col.status);
          return (
            <div
              key={col.status}
              className="flex max-h-[calc(100vh-260px)] w-[320px] shrink-0 flex-col rounded-xl border border-border bg-card"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${columnDot[col.status]}`} />
                  <span className="font-sans text-xs font-semibold uppercase tracking-wide text-foreground">
                    {col.label}
                  </span>
                </div>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                    {isFiltering ? "No matches" : "Nothing here"}
                  </p>
                ) : (
                  items.map((p) => <ProspectCard key={p.id} prospect={p} onChange={onChange} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
