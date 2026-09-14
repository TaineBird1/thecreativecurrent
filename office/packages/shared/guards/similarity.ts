/**
 * Template detection.
 *
 * The rule is "individually written one-to-one messages, no templates blasted
 * to a list". A bot told to personalise will happily produce twenty emails that
 * differ only in the business name, and that is a template with extra steps.
 *
 * Trigram Jaccard similarity catches it: it is insensitive to word order and to
 * a swapped noun, which is exactly the failure mode. Above the ceiling, the
 * send is refused and the bot is told to write a real one.
 */

export function trigrams(text: string): Set<string> {
  const normalised = (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalised.split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    if (normalised) out.add(normalised);
    return out;
  }
  for (let i = 0; i <= words.length - 3; i++) {
    out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function similarity(a: string, b: string): number {
  return jaccard(trigrams(a), trigrams(b));
}

/**
 * Strip the personalisation out of an email, leaving its skeleton.
 *
 * This matters more than it sounds. Measured on the raw text, two emails that
 * are word-for-word identical apart from a swapped business name and suburb
 * score about 0.67 on a ~30-word email — comfortably under any ceiling you
 * would want to set, because a short text has few trigrams and each swap
 * breaks six of them. In other words, comparing raw text would MISS the exact
 * failure mode this guard exists to catch.
 *
 * So we compare skeletons: replace the fields that are supposed to differ per
 * prospect (name, business, suburb, domain, the quoted fault) with a
 * placeholder, then compare what is left. A genuine template scores ~1.0. An
 * email that was actually written for this one prospect scores low, because
 * the argument itself differs, not just the nouns.
 */
export function skeleton(text: string, personalisation: string[]): string {
  let out = ` ${text ?? ""} `;
  const parts = personalisation
    .filter((p) => p && p.trim().length > 2 && p !== "not_found")
    // Longest first, so "Ballito Roofing" is replaced before "Ballito".
    .sort((a, b) => b.length - a.length);
  for (const p of parts) {
    const escaped = p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), " xx ");
  }
  return out.replace(/\s+/g, " ").trim();
}

export interface SimilarityVerdict {
  tooSimilar: boolean;
  score: number;
  /** Index of the recent send it most resembles, for the error message. */
  closestIndex: number;
}

/**
 * Compare a candidate against recent sends. Both sides should already be
 * skeletons — see `skeleton()` above for why raw text is the wrong input.
 */
export function checkAgainstRecent(
  candidate: string,
  recent: string[],
  ceiling: number,
): SimilarityVerdict {
  const cand = trigrams(candidate);
  let best = 0;
  let bestIndex = -1;
  recent.forEach((r, i) => {
    const score = jaccard(cand, trigrams(r));
    if (score > best) {
      best = score;
      bestIndex = i;
    }
  });
  return { tooSimilar: best >= ceiling, score: best, closestIndex: bestIndex };
}
