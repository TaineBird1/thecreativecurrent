/**
 * South African contact normalisation.
 *
 * The rule that drives all of this: a field is either a real value or the
 * literal string "not_found". Never blank, never invented. A blank field is
 * indistinguishable from "nobody looked yet"; an invented phone number is
 * actively harmful.
 */

export const NOT_FOUND = "not_found";

/**
 * Normalise a SA number to +27XXXXXXXXX, the form WhatsApp wants.
 * Returns NOT_FOUND rather than a guess if it cannot be made sense of.
 */
export function toWhatsApp(raw: string | null | undefined): string {
  if (!raw) return NOT_FOUND;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return NOT_FOUND;

  let national: string;
  if (digits.startsWith("+27")) national = digits.slice(3);
  else if (digits.startsWith("0027")) national = digits.slice(4);
  else if (digits.startsWith("27") && digits.length >= 11) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;

  national = national.replace(/\D/g, "");
  if (national.length !== 9) return NOT_FOUND;
  return `+27${national}`;
}

/** SA mobile prefixes. A landline in the mobile field is a wasted WhatsApp attempt. */
const MOBILE_PREFIXES = ["6", "7", "8"];

export function isMobile(normalised: string): boolean {
  if (!normalised.startsWith("+27") || normalised.length !== 12) return false;
  return MOBILE_PREFIXES.includes(normalised[3]);
}

/** Split a pile of scraped numbers into a mobile and a landline. */
export function splitNumbers(raw: string[]): { mobile: string; landline: string } {
  const normalised = raw.map(toWhatsApp).filter((n) => n !== NOT_FOUND);
  const mobile = normalised.find(isMobile) ?? NOT_FOUND;
  const landline = normalised.find((n) => !isMobile(n)) ?? NOT_FOUND;
  return { mobile, landline };
}

export function findNumbers(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:\+?27|\b0)[\s.-]?(?:\d[\s.-]?){8,9}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = toWhatsApp(m[0]);
    if (n !== NOT_FOUND) out.add(n);
  }
  return [...out];
}

export interface EmailGuess {
  email: string;
  status: "published" | "inferred" | "not_found";
}

/**
 * Pick the best published email, or infer one from the domain.
 *
 * An inferred address is ALWAYS marked inferred and never presented as
 * verified — verifying it properly needs a paid API, and a bounced first
 * impression is worse than no email at all.
 */
export function pickEmail(published: string[], websiteUrl: string): EmailGuess {
  const clean = published
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(e))
    .filter((e) => !/^(?:no-?reply|donotreply|postmaster|abuse|webmaster)@/.test(e))
    // Not the web designer's own address in the footer.
    .filter((e) => !/@(?:wix|squarespace|wordpress|godaddy|gmail\.com\.)/.test(e));

  if (clean.length > 0) {
    // Prefer a role address that a human actually reads.
    const preferred =
      clean.find((e) => /^(?:info|admin|enquiries|enquiry|sales|office|hello|bookings)@/.test(e)) ??
      clean[0];
    return { email: preferred, status: "published" };
  }

  const domain = extractDomain(websiteUrl);
  if (!domain) return { email: NOT_FOUND, status: "not_found" };

  // info@ is the overwhelmingly common pattern for a small SA trade business.
  return { email: `info@${domain}`, status: "inferred" };
}

export function extractDomain(url: string): string | null {
  if (!url || url === NOT_FOUND) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The dedupe key. Domain when there is one (two directories listing the same
 * business will agree on the domain but not on the spelling of the name),
 * otherwise a normalised name + suburb.
 */
export function dedupeKey(businessName: string, suburb: string, websiteUrl: string): string {
  const domain = extractDomain(websiteUrl);
  if (domain) return domain;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(?:pty|ltd|cc|inc|the|and|&)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  return `${norm(businessName)}|${norm(suburb)}`;
}

/** True if we have any way at all to reach them. No contact = discard. */
export function isReachable(lead: {
  mobile: string;
  landline: string;
  email: string;
  facebookUrl: string;
}): boolean {
  return [lead.mobile, lead.landline, lead.email, lead.facebookUrl].some(
    (f) => f && f !== NOT_FOUND,
  );
}

/**
 * Pick the address out of a Google Maps result card.
 *
 * The card is a pile of unrelated lines — rating, category, address, opening
 * hours, phone, "Wheelchair accessible". Flattened together they produced
 * addresses like "23 Marine Dr Open · Closes 4:30 pm · 083 491 5516", which is
 * not something you can put in an email. Pick the one line that looks like a
 * street address and leave the rest alone.
 */
export function addressFromCard(cardText: string): string {
  const lines = cardText.split("|").map((l) => l.trim()).filter(Boolean);

  const isNotAddress = (l: string) =>
    /^(open|closed|opens|closes|temporarily|permanently|·)/i.test(l) ||
    /closes \d|opens \d|⋅|24 hours/i.test(l) ||
    /^\d+(\.\d+)?\(\d+\)$/.test(l) || // "4.9(12)"
    /^(?:\+27|0)(?:[\s.-]?\d){8,9}$/.test(l.replace(/\s/g, "")) ||
    /wheelchair|on[- ]site services|online estimates|delivery|in-store/i.test(l);

  const looksLikeAddress = (l: string) =>
    /\b(street|st|road|rd|ave|avenue|drive|dr|crescent|cres|lane|close|way|boulevard|blvd|highway|hwy|park|centre|center|mall|plaza|unit|shop|erf|plot)\b/i.test(
      l,
    ) || /^\d{1,5}[a-z]?\s+[A-Z]/.test(l);

  const match = lines.find((l) => !isNotAddress(l) && looksLikeAddress(l));
  return match ? match.replace(/\s+/g, " ").trim() : NOT_FOUND;
}
