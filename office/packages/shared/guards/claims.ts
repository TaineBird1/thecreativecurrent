/**
 * The claims guard — SEO, ranking and performance promises.
 *
 * Gated exactly like money, for the same reason: a promise about a ranking, a
 * traffic number, or a timeframe for results is something Taine would have to
 * honour. The mechanism is identical to the money guard; only the vocabulary
 * differs.
 */
import type { GuardHit, GuardResult } from "./money";

const RANKING: [RegExp, string][] = [
  [/\bpage\s?(?:one|1)\b/gi, "a ranking promise"],
  [/\bfirst page\b/gi, "a ranking promise"],
  [/\b(?:number|no\.?|#)\s?1\b/gi, "a ranking promise"],
  [/\btop (?:of|spot|result|three|3|five|5|ten|10)\b/gi, "a ranking promise"],
  [/\brank(?:ing|ed)? (?:higher|first|top|number|#|on|for)\b/gi, "a ranking promise"],
  [/\boutrank\b|\bbeat your competit/gi, "a ranking promise"],
  [/\bget you (?:found|seen|to the top|on google)\b/gi, "a ranking promise"],
  [/\bdominate\b/gi, "a ranking promise"],
];

const TRAFFIC: [RegExp, string][] = [
  [/\b(?:double|triple|quadruple|2x|3x|5x|10x)\b/gi, "a multiplier promise"],
  [/\b\d+\s?%\s?(?:more|increase|uplift|growth|boost)/gi, "a percentage promise"],
  [/\bmore (?:leads|enquiries|inquiries|customers|calls|bookings|traffic|sales|business)\b/gi, "a traffic or enquiry promise"],
  [/\b(?:increase|boost|grow|drive|generate)\s+(?:your\s+)?(?:leads|enquiries|inquiries|traffic|sales|bookings|revenue|customers)\b/gi, "a traffic or enquiry promise"],
  [/\b\d[\d,]*\s?(?:leads|enquiries|inquiries|visitors|bookings|calls)\s?(?:a|per)\s?(?:day|week|month)\b/gi, "a specific volume promise"],
  [/\bROI\b|\breturn on (?:your )?investment\b/gi, "a return promise"],
];

const GUARANTEE: [RegExp, string][] = [
  [/\bguarantee[sd]?\b|\bguaranteed\b/gi, "a guarantee"],
  [/\bwe(?:'ll| will) get you\b/gi, "a guarantee"],
  [/\bi promise\b|\bwe promise\b|\bpromised\b/gi, "a promise"],
  [/\brisk[- ]free\b/gi, "a guarantee"],
  [/\bno[- ]brainer\b/gi, "a guarantee"],
  [/\byou(?:'ll| will) (?:see|get|start getting|notice)\b/gi, "a predicted outcome"],
];

/**
 * A timeframe on its own is fine ("about 3 weeks to build"). A timeframe
 * attached to an OUTCOME is a promise. This looks for the pairing, not the
 * duration — otherwise every honest project timeline would land in Approvals.
 */
const TIMEFRAME_OUTCOME =
  /\b(?:within|in|after|inside of|in just|in as little as)\s+\d+\s*(?:day|days|week|weeks|month|months)\b[^.!?\n]{0,80}\b(?:ranks?|rankings?|page|traffic|leads|enquir(?:y|ies)|inquir(?:y|ies)|results?|calls|bookings|sales|customers|top|found|seen|positions?)\b/gi;

const OUTCOME_TIMEFRAME =
  /\b(?:ranks?|rankings?|traffic|leads|enquir(?:y|ies)|inquir(?:y|ies)|results?|calls|bookings|sales|customers|positions?)\b[^.!?\n]{0,80}\b(?:within|in|after|inside of|in just|in as little as)\s+\d+\s*(?:day|days|week|weeks|month|months)\b/gi;

function collect(text: string, patterns: [RegExp, string][], hits: GuardHit[]): void {
  for (const [re, why] of patterns) {
    const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const m = rx.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      hits.push({ match: `…${text.slice(start, end).replace(/\s+/g, " ").trim()}…`, why });
    }
  }
}

export function checkClaims(text: string): GuardResult {
  const t = text ?? "";
  const hits: GuardHit[] = [];
  collect(t, RANKING, hits);
  collect(t, TRAFFIC, hits);
  collect(t, GUARANTEE, hits);
  collect(t, [[TIMEFRAME_OUTCOME, "a timeframe attached to a result"]], hits);
  collect(t, [[OUTCOME_TIMEFRAME, "a timeframe attached to a result"]], hits);

  if (hits.length === 0) return { tripped: false, hits: [], reason: "" };

  const whys = [...new Set(hits.map((h) => h.why))];
  return {
    tripped: true,
    hits,
    reason: `Contains ${whys.slice(0, 3).join(", ")}. That is a promise you would have to honour.`,
  };
}

export type { GuardHit, GuardResult };
