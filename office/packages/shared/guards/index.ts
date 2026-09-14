/**
 * The gate every outbound artefact passes through.
 *
 *   bot output -> money -> claims -> (send limiter) -> (kill switch) -> send
 *
 * Any one of them can stop it. The first two produce an Approvals row; the
 * second two refuse outright. This module owns the first two and the decision
 * about what to do with a hit; convex/outbound.ts owns the rest, because they
 * need database and context access.
 */
import { checkMoney, type GuardResult } from "./money";
import { checkClaims } from "./claims";

export { checkMoney } from "./money";
export { checkClaims } from "./claims";
export * from "./pii";
export * from "./similarity";
export type { GuardHit, GuardResult } from "./money";

export type GuardName = "money" | "claims";

export interface GateVerdict {
  /** True when the artefact may proceed without Taine seeing it first. */
  clear: boolean;
  guard?: GuardName;
  reason: string;
  matches: string[];
}

/**
 * Run both content guards. Money is checked first because a hit there is the
 * more consequential of the two and makes the better Approvals headline.
 */
export function gate(text: string): GateVerdict {
  const money = checkMoney(text);
  if (money.tripped) {
    return { clear: false, guard: "money", reason: money.reason, matches: money.hits.map((h) => h.match) };
  }
  const claims = checkClaims(text);
  if (claims.tripped) {
    return { clear: false, guard: "claims", reason: claims.reason, matches: claims.hits.map((h) => h.match) };
  }
  return { clear: true, reason: "", matches: [] };
}

/** Gate a whole artefact (subject + body, or any set of fields). */
export function gateAll(parts: Record<string, string | undefined>): GateVerdict {
  for (const [field, value] of Object.entries(parts)) {
    if (!value) continue;
    const verdict = gate(value);
    if (!verdict.clear) {
      return { ...verdict, reason: `${verdict.reason} (in the ${field})` };
    }
  }
  return { clear: true, reason: "", matches: [] };
}

export type { GuardResult };
