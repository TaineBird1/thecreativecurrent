import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { DEFAULT_MAX_PER_DAY, DEFAULT_MAX_PER_BATCH } from "../../src/lib/prospects.js";

// Protects the Gmail account the outreach sends through.
//
// The risk is not Gmail's ~500/day hard cap -- it is reputation, which suffers
// long before that. On 7 August 45 near-identical messages went out from one
// personal account in under four minutes, which is exactly the pattern spam
// filtering is built to catch. Getting that address flagged would end the
// channel entirely, so the ceiling here is deliberately far below what Gmail
// would technically allow.
//
// Three limits, doing different jobs:
//
//   MAX_PER_DAY   - total volume. The one that actually protects reputation.
//   MAX_PER_BATCH - how many a single request may send. Exists because a
//                   Vercel function has a hard execution ceiling: at roughly
//                   4s per Gmail SMTP send, a large batch would be killed
//                   mid-run, leaving some prospects marked sent and others
//                   silently not.
//   SEND_GAP_MS   - spacing inside a batch. Small on purpose. A long gap is
//                   impossible within a function timeout, so this only breaks
//                   up the machine-gun pattern; MAX_PER_DAY is what does the
//                   real work.
export const MAX_PER_DAY = Number(process.env.OUTREACH_MAX_PER_DAY ?? DEFAULT_MAX_PER_DAY);
export const MAX_PER_BATCH = Number(process.env.OUTREACH_MAX_PER_BATCH ?? DEFAULT_MAX_PER_BATCH);
export const SEND_GAP_MS = Number(process.env.OUTREACH_SEND_GAP_MS ?? 1000);

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Counts sends in a rolling 24 hours rather than since local midnight.
 * A calendar-day window can be gamed without meaning to -- 20 at 23:00 and
 * another 20 at 00:05 is 40 sends in an hour while never breaking a daily
 * cap. A rolling window cannot be walked around that way.
 *
 * Counted from email_log because that is the record of what actually left,
 * including follow-ups: they go through the same account and cost the same
 * reputation, so they draw on the same budget.
 */
export async function sentInLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("type", "outreach")
    .eq("status", "sent")
    .gte("created_at", since);

  // Fail closed. If the count cannot be read we cannot know how much has
  // already gone out today, and quietly assuming zero is how an account gets
  // flagged. Reporting the cap as fully used makes the endpoint refuse, which
  // is recoverable; over-sending is not.
  if (error) {
    console.error("sendGuard: could not read email_log, refusing to send:", error.message);
    return MAX_PER_DAY;
  }
  return count ?? 0;
}

export type SendBudget = {
  /** How many may be sent in this request, after both caps are applied. */
  allowed: number;
  sentToday: number;
  remainingToday: number;
  /** Set when allowed is smaller than what was asked for. */
  limitReason: string | null;
};

export async function getSendBudget(requested: number): Promise<SendBudget> {
  const sentToday = await sentInLast24h();
  const remainingToday = Math.max(0, MAX_PER_DAY - sentToday);
  const allowed = Math.min(requested, remainingToday, MAX_PER_BATCH);

  let limitReason: string | null = null;
  if (allowed < requested) {
    limitReason =
      remainingToday <= MAX_PER_BATCH
        ? `daily limit reached (${sentToday}/${MAX_PER_DAY} sent in the last 24h)`
        : `batch limit of ${MAX_PER_BATCH} per run`;
  }

  return { allowed, sentToday, remainingToday, limitReason };
}
