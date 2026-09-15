/**
 * PII pseudonymiser.
 *
 * Free-tier Gemini may use prompts for training. Client and prospect contact
 * details must not end up in someone's training corpus, so they never leave
 * this process in the clear.
 *
 * Two mechanisms, and the difference matters:
 *
 *  - `pseudonymise()` swaps identifiers for stable tokens («PERSON_1»,
 *    «EMAIL_1»). The model still reasons about "the owner" coherently, and
 *    `restore()` puts the real values back in the output.
 *  - `assertNoForbiddenContent()` is a hard block, not a mask. Quotes,
 *    contracts and invoices do not go to an LLM at all, masked or otherwise —
 *    there is no version of a signed contract that is safe to hand to a free
 *    tier for training.
 */

export interface Pseudonymised {
  text: string;
  /** token -> original. Never logged, never persisted, never sent anywhere. */
  map: Map<string, string>;
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g;
// SA numbers in the shapes that actually turn up: +27..., 0XX..., 0XX XXX XXXX.
const PHONE_RE = /(?:\+27|\b0)(?:\s?\d){8,10}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/g;

export function pseudonymise(
  text: string,
  extraNames: string[] = [],
): Pseudonymised {
  const map = new Map<string, string>();
  const reverse = new Map<string, string>();
  let counters = { PERSON: 0, EMAIL: 0, PHONE: 0, URL: 0 };

  const tokenFor = (kind: keyof typeof counters, value: string): string => {
    const existing = reverse.get(value);
    if (existing) return existing;
    counters[kind] += 1;
    const token = `«${kind}_${counters[kind]}»`;
    map.set(token, value);
    reverse.set(value, token);
    return token;
  };

  let out = text ?? "";

  // Structured identifiers first. A name is very often a substring of the
  // email address ("dean" in dean@…), so masking names first would leave a
  // half-token the email pattern can no longer match, and the domain would
  // leak. Address-shaped things go first; names mop up what is left.
  out = out.replace(EMAIL_RE, (m) => tokenFor("EMAIL", m));
  out = out.replace(URL_RE, (m) => tokenFor("URL", m));
  out = out.replace(PHONE_RE, (m) => tokenFor("PHONE", m));

  for (const name of extraNames.filter((n) => n && n.trim().length > 2 && n !== "not_found")) {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), () => tokenFor("PERSON", name.trim()));
  }

  return { text: out, map };
}

/**
 * The delimiters a model actually returns a token in.
 *
 * We hand it «URL_1». It hands back `<URL_1>`, `[URL_1]`, `(URL_1)` or a bare
 * `URL_1`, because models normalise punctuation they think is decorative. An
 * exact-string replace matches none of those, and the consequence is not a
 * cosmetic one: a prospect received an email reading "Here's a site we built —
 * <URL_1>", with the proof link — the entire reason for the paragraph — replaced
 * by a placeholder.
 *
 * Built per token id with a negative lookahead on the digits, so restoring
 * URL_1 can never eat the front of URL_10.
 */
function tokenPattern(kind: string, index: string): RegExp {
  return new RegExp(`[«<\\[{(\`"']?\\s*${kind}_${index}(?!\\d)\\s*[»>\\]})\`"']?`, "g");
}

const TOKEN_ID_RE = /^«(PERSON|EMAIL|PHONE|URL)_(\d+)»$/;

/** Put the real values back into whatever the model wrote. */
export function restore(text: string, map: Map<string, string>): string {
  let out = text ?? "";
  // Longest ids first: with «URL_1» and «URL_10» both live, replacing the
  // shorter one first would be wrong even with the lookahead guarding it.
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [token, value] of entries) {
    out = out.split(token).join(value);
    const id = TOKEN_ID_RE.exec(token);
    if (id) out = out.replace(tokenPattern(id[1], id[2]), value);
  }
  return out;
}

/**
 * True if any pseudonym token survived into the final text unreplaced.
 *
 * Matches the same delimiter variants `restore` handles — the previous version
 * only looked for «…», so it agreed with the bug rather than catching it. This
 * is the last line before an email leaves; see convex/outbound.ts.
 */
export function hasOrphanTokens(text: string): boolean {
  return /[«<\[{(`"']?\s*(?:PERSON|EMAIL|PHONE|URL)_\d+\s*[»>\]})`"']?/.test(text ?? "");
}

export class ForbiddenContentError extends Error {
  constructor(public what: string) {
    super(
      `Refused to send this to an LLM: it looks like ${what}. Quotes, contracts and invoices never go to a free-tier model — it may be used for training.`,
    );
    this.name = "ForbiddenContentError";
  }
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bsigned (?:by|for|on)\b|\bsignature:/i, "a signed document"],
  [/\binvoice (?:number|no\.?|#)\s*[:#]?\s*\w+/i, "an invoice"],
  [/\bbank(?:ing)? details\b|\baccount (?:number|no\.?)\b|\bbranch code\b/i, "banking details"],
  [/\bID (?:number|no\.?)\b\s*[:#]?\s*\d{6}/i, "an ID number"],
  [/\bVAT (?:number|no\.?|reg)\b/i, "a VAT registration"],
  [/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, "a card number"],
];

/**
 * Call before every LLM request whose payload includes anything derived from a
 * real document. Throws rather than masking — see the note at the top.
 */
export function assertNoForbiddenContent(text: string): void {
  for (const [re, what] of FORBIDDEN) {
    if (re.test(text ?? "")) throw new ForbiddenContentError(what);
  }
}

/**
 * Convenience wrapper: the shape every bot uses. Pseudonymise, hard-check, hand
 * back the safe text plus the restore function.
 */
export function prepareForLlm(
  text: string,
  names: string[] = [],
): { safe: string; restoreOutput: (s: string) => string } {
  assertNoForbiddenContent(text);
  const { text: safe, map } = pseudonymise(text, names);
  return { safe, restoreOutput: (s: string) => restore(s, map) };
}
