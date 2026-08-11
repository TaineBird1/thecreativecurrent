import { ProspectCard } from "./ProspectCard";
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
// prospectStatusTone's value into a template string would silently produce
// no styling, since nothing in the source would spell out e.g. "text-success".
const columnLabelTone: Record<ProspectStatus, string> = {
  new: "text-muted-foreground",
  drafted: "text-orange-400",
  approved: "text-primary",
  sent: "text-green-500",
  replied: "text-green-500",
  won: "text-green-500",
  lost: "text-muted-foreground",
  no_answer: "text-muted-foreground",
  callback: "text-orange-400",
};

export function PipelineBoard({ prospects, onChange }: { prospects: Prospect[]; onChange: () => void }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {PIPELINE_COLUMNS.map((col) => {
        const items = prospects.filter((p) => p.status === col.status);
        return (
          <div key={col.status} className="w-[360px] shrink-0">
            <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-black px-3 py-2">
              <span
                className={`font-sans text-xs font-semibold uppercase tracking-wide ${columnLabelTone[col.status]}`}
              >
                {col.label}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Nothing here
                </p>
              ) : (
                items.map((p) => <ProspectCard key={p.id} prospect={p} onChange={onChange} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
