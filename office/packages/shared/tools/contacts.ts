/**
 * South African contact normalisation.
 *
 * The rule that drives all of this: a field is either a real value or the
 * literal string "not_found". Never blank, never invented. A blank field is
 * indistinguishable from "nobody looked yet"; an invented phone number is
 * actively harmful.
 */

import { isDirectoryHost } from "./sources";

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
    .filter((e) => !/@(?:wix|squarespace|wordpress|godaddy|gmail\.com\.)/.test(e))
    // Nor the directory's own. A listing page carries the business's details
    // and the directory's, and taking the wrong one means an email addressed
    // to a plumber and delivered to Snupit — marked "published", so nothing
    // downstream would hold it back.
    .filter((e) => !isDirectoryHost(e.split("@")[1]));

  if (clean.length > 0) {
    // Prefer a role address that a human actually reads.
    const preferred =
      clean.find((e) => /^(?:info|admin|enquiries|enquiry|sales|office|hello|bookings)@/.test(e)) ??
      clean[0];
    return { email: preferred, status: "published" };
  }

  const domain = extractDomain(websiteUrl);
  if (!domain) return { email: NOT_FOUND, status: "not_found" };

  // The half of this the published filter above did not cover, and it showed
  // up within one run: a business with no website of its own falls back to the
  // URL it was found at, which for a directory listing is the directory. Four
  // Snupit leads came out holding "info@snupit.co.za" — a guess at the address
  // of the website we would be offering to rebuild.
  //
  // Held back as a guess rather than sent, so nothing went out. It is still an
  // address nobody should be asked to confirm.
  if (isDirectoryHost(domain)) return { email: NOT_FOUND, status: "not_found" };

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

/**
 * True if we have any way at all to reach them. No contact = discard.
 *
 * A guessed address does not count, and used not to: this read `lead.email`
 * without looking at `emailStatus`, so every business with a website came with
 * a free `info@theirdomain.co.za` and therefore always looked contactable. The
 * outreach queue then excluded guesses — correctly — and the lead sat in the
 * hold-back pile, qualified and permanently unwritable.
 *
 * Six of them were checked by hand and not one published an address anywhere,
 * which is the same thing said out loud: this function was passing leads
 * nobody could reach. The guess is still kept on the row and still offered for
 * a human to confirm; it is just no longer evidence of anything.
 */
export function isReachable(lead: {
  mobile: string;
  landline: string;
  email: string;
  emailStatus: "published" | "inferred" | "not_found";
  facebookUrl: string;
}): boolean {
  const email = lead.emailStatus === "published" ? lead.email : NOT_FOUND;
  return [lead.mobile, lead.landline, email, lead.facebookUrl].some(
    (f) => f && f !== NOT_FOUND,
  );
}

/**
 * The page on their own site most likely to carry an email address.
 *
 * Reading only the homepage is why so many leads arrive with a guess: a small
 * trade business puts the address on its contact page and links to it from the
 * nav. One extra fetch is cheap, deterministic, and needs no model — and each
 * one it resolves is a lead a person does not have to go and look up by hand.
 *
 * Same origin only, so a "Contact" link pointing at a Facebook page or a
 * directory listing cannot send the scraper wandering.
 */
export function contactPageUrl(pageLinks: string[], baseUrl: string): string | null {
  let origin: string;
  try {
    origin = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`).origin;
  } catch {
    return null;
  }

  // Best first: a page whose whole job is contact details, then an about page,
  // which is where a one-page site usually hides them instead.
  const patterns = [
    /\/(?:contact|contact-us|contactus|kontak|get-in-touch|enquir\w*)\/?$/i,
    /\/(?:about|about-us|aboutus|oor-ons)\/?$/i,
  ];

  for (const pattern of patterns) {
    for (const href of pageLinks) {
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      if (url.origin !== origin) continue;
      if (pattern.test(url.pathname)) return url.href;
    }
  }
  return null;
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

/**
 * The name to greet someone by, or null if we do not actually have one.
 *
 * "Hi STEVEN WELLS PLUMBING SERVICES," went to a real prospect. The contact
 * name on that lead was the business name, in the capitals the listing used,
 * and the greeting line pasted it in as though it were a person — which tells
 * the reader in four words that nobody read this before it was sent.
 *
 * The check that matters is against the business name itself: a "contact" that
 * is the business is not a person, however it is spelled. "Hello," is a
 * perfectly good greeting and is what we fall back to, exactly as we already do
 * when no name was found at all.
 */
export function personalName(
  contactName: string | null | undefined,
  businessName: string,
): string | null {
  let raw = (contactName ?? "").trim();
  if (!raw || raw === NOT_FOUND) return null;

  // "Hi Luke / Sulli," went out to a real prospect. A listing that names two
  // owners is not wrong, it just is not how anyone is greeted — write to the
  // first one, the way you would if you had read the page yourself.
  raw = raw.split(/\s*(?:\/|&|,|\band\b)\s*/i)[0].trim();
  if (!raw) return null;

  // Nobody's name has a number in it, and splitting on the comma above turns a
  // whole street address into a plausible-looking two words — "Hi 23 Marine
  // Drive," is worse than the address sitting unused in the field.
  if (/\d/.test(raw)) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const name = norm(raw);
  const business = norm(businessName);
  if (!name) return null;

  // The business under another spelling, or a fragment of it.
  if (name === business) return null;
  if (business.includes(name) || name.includes(business)) return null;

  // A registered company, whatever else it says.
  if (/\b(?:pty|ltd|cc|inc|proprietary|limited)\b/.test(name)) return null;

  // Nobody is greeted by four words. A string this long is a company, a job
  // title, or a whole address that got picked up by mistake.
  const words = raw.split(/\s+/);
  if (words.length > 3 || raw.length > 40) return null;

  // A listing shouts; a greeting should not. Only reshaped when it is entirely
  // upper case, so "McBride" and "van Niekerk" are left exactly as written.
  if (raw === raw.toUpperCase()) {
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw;
}
