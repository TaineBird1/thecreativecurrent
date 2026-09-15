/**
 * The money guard.
 *
 * Applied to EVERY bot's outbound artefact, not just the Proposal bot's — a
 * price that slips into a "friendly" check-in email is exactly as binding as
 * one in a formal quote.
 *
 * Deliberately over-eager. A false positive costs one click in Approvals. A
 * false negative costs a number Taine has to honour.
 */

export interface GuardHit {
  /** The exact text that tripped it, with a little surrounding context. */
  match: string;
  /** Why this matters, in words a human reads once and agrees with. */
  why: string;
}

export interface GuardResult {
  tripped: boolean;
  hits: GuardHit[];
  /** One-line summary for the Approvals card. */
  reason: string;
}

const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/\bR\s?\d[\d\s,]*(?:\.\d{2})?\b/g, "a rand figure"],
  [/\bZAR\s?\d[\d\s,.]*/gi, "a rand figure"],
  [/\b\d[\d\s,]*\s?(?:rand|rands)\b/gi, "a rand figure"],
  [/[$£€]\s?\d[\d\s,.]*/g, "a currency figure"],
  [/\b\d[\d\s,]*\s?(?:per month|pm|p\/m|a month|monthly)\b/gi, "a recurring fee"],
];

const PRICING_WORDS: [RegExp, string][] = [
  [/\bquote(?:s|d|ation)?\b/gi, "a quote"],
  [/\bproposals?\b/gi, "a proposal"],
  [/\binvoic(?:e|es|ing)\b/gi, "invoicing"],
  [/\bdeposits?\b/gi, "a deposit"],
  [/\bdiscounts?(?:ed|ing)?\b/gi, "a discount"],
  [/\brefunds?(?:ed)?\b/gi, "a refund"],
  [/\bretainers?\b/gi, "a retainer"],
  [/\bad spend\b/gi, "ad spend"],
  [/\bbudgets?\b/gi, "a budget figure"],
  [/\bprice[sd]?\b|\bpricing\b/gi, "pricing"],
  [/\bcosts?\b/gi, "a cost"],
  [/\bfees?\b/gi, "a fee"],
  [/\bpay(?:ment|able|s)?\b/gi, "payment"],
  [/\bbilling\b|\bbilled\b/gi, "billing"],
  [/\bfree of charge\b|\bno charge\b|\bat no cost\b/gi, "an offer to do something free"],
  [/\bon the house\b|\bwon'?t cost you\b/gi, "an offer to do something free"],
];

const CONTRACT_WORDS: [RegExp, string][] = [
  [/\bagreements?\b/gi, "contract language"],
  [/\bcontracts?(?:ual)?\b/gi, "contract language"],
  [/\bterms and conditions\b|\bT&Cs?\b/gi, "contract language"],
  [/\bsign(?:ature|ed|ing)?\b/gi, "a signature request"],
  [/\bbinding\b|\bliability\b|\bindemnif/gi, "contract language"],
  [/\bnotice period\b|\bcancellation\b/gi, "contract language"],
];

/**
 * A few phrases read as money but are not. "It costs you nothing to reply" is
 * not a quote. Checked first so the obvious ones do not clutter Approvals.
 */
const ALLOWED = [
  /\bcosts? you nothing to (?:reply|chat|have a look)\b/gi,
  /\bfree direct booking audit\b/gi,
  // "quote button", "quote form", "quote request form" name a FEATURE we build
  // into a site. "I'll send you a quote" is still a price and still trips.
  /\bquote (?:button|form|request form|page|flow|widget)\b/gi,
  /\bquote[- ]request\b/gi,
  /\brequest[- ]a[- ]quote (?:button|form|page)\b/gi,
  // A VISITOR wanting a quote is the prospect's own enquiry problem, not a
  // price we are offering. Every "your site has no contact form" email says
  // this, so without it the same false positive lands in Approvals forever
  // until nobody reads the inbox — which costs more than it saves. The subject
  // has to be the visitor: "I'll send you a quote" has no such subject and
  // still trips, as does any quote with a number anywhere near it.
  /\b(?:someone|anyone|somebody|people|customers?|visitors?|clients?|homeowners?)\s+(?:who\s+)?(?:wants?|wanting|needs?|needing|looking for)\s+a\s+quote\b/gi,
  /\bfree audit\b/gi,
  /\bat your own pace\b/gi,
];

function stripAllowed(text: string): string {
  let out = text;
  for (const re of ALLOWED) out = out.replace(re, " ");
  return out;
}

function collect(text: string, patterns: [RegExp, string][], hits: GuardHit[]): void {
  for (const [re, why] of patterns) {
    const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      hits.push({ match: `…${text.slice(start, end).replace(/\s+/g, " ").trim()}…`, why });
      if (m[0].length === 0) rx.lastIndex++;
      // One hit per pattern is enough to route it; more just makes noise.
      break;
    }
  }
}

export function checkMoney(text: string): GuardResult {
  const scanned = stripAllowed(text ?? "");
  const hits: GuardHit[] = [];
  collect(scanned, CURRENCY_PATTERNS, hits);
  collect(scanned, PRICING_WORDS, hits);
  collect(scanned, CONTRACT_WORDS, hits);

  if (hits.length === 0) {
    return { tripped: false, hits: [], reason: "" };
  }
  const whys = [...new Set(hits.map((h) => h.why))];
  return {
    tripped: true,
    hits,
    reason: `Mentions ${whys.slice(0, 3).join(", ")}. Anything touching money needs your say-so.`,
  };
}
