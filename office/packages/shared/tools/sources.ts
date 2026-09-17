/**
 * Where leads come from.
 *
 * Honesty about each source matters more than the list looking impressive:
 * `reliability` is what the Lead-gen bot and the UI use to decide how much to
 * lean on a source, and `note` says exactly what the catch is.
 *
 * Nothing here needs a key or a paid tier. Anything that would is absent, not
 * quietly degraded.
 */

export type TierNum = 1 | 2 | 3;

export interface Source {
  id: string;
  label: string;
  /** Which tiers this source is actually useful for. */
  tiers: TierNum[];
  /** "good" = stable HTML, "fragile" = works but breaks when they redesign,
   *  "hostile" = actively defends against scraping; expect to find nothing. */
  reliability: "good" | "fragile" | "hostile";
  /** Needs a real browser (the local worker), not a plain fetch. */
  needsBrowser: boolean;
  note: string;
  search: (category: string, location: string) => string;
}

const q = encodeURIComponent;

/**
 * Snupit's search URL, which is not a search URL any more.
 *
 * It was `/search?q=plumber&location=Durban`, and that has been answering
 * HTTP 410 Gone — deliberately retired, not broken — on every run for as far
 * back as the logs go, while the source sat at one lead total and looked like
 * a directory that simply had nothing to offer. It is now a page per location
 * and trade: `/durban/plumbers`.
 *
 * The trade is pluralised because the path names a category, not a search
 * term. Anything already plural or ending in -ing is left alone, since
 * "waterproofings" and "self-caterings" are pages that do not exist.
 *
 * A category whose plural we guess wrong lands on a 404, and that now says so
 * out loud in Logs -> Tools rather than looking like an empty result.
 */
export function snupitUrl(category: string, location: string): string {
  return `https://www.snupit.co.za/${slug(location)}/${slug(pluralise(category))}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pluralise(category: string): string {
  const words = category.trim().split(/\s+/);
  const last = (words.pop() ?? "").toLowerCase();
  if (!last) return category;
  // "renovations" and "retaining walls" are already plural; "waterproofing"
  // and "self catering" are gerunds and never take one.
  const plural = last.endsWith("s") || last.endsWith("ing") ? last : `${last}s`;
  return [...words, plural].join(" ");
}

export const SOURCES: Source[] = [
  {
    id: "snupit",
    label: "Snupit",
    tiers: [1, 2],
    reliability: "good",
    needsBrowser: false,
    note: "SA trade directory. Plain server-rendered HTML, contact details usually on the listing page — the only source that hands over an email rather than making us go and look for one.",
    search: (c, l) => snupitUrl(c, l),
  },
  {
    id: "yellowpages_sa",
    label: "Yellow Pages SA",
    tiers: [1, 2, 3],
    reliability: "fragile",
    // Every plain fetch came back HTTP 200 with ZERO links on the page — not
    // zero matching links, none at all. A served HTML page always has anchors,
    // so what arrives is an empty shell that builds its results in the browser.
    // No URL fixes that; it needs something that runs JavaScript, which is the
    // worker. Costs a worker job per search and finds nothing when the worker
    // is off, which is the honest trade rather than a silent daily zero.
    needsBrowser: true,
    note: "Broad coverage, but the results are rendered in JavaScript — a plain fetch sees an empty page, so this only works while the local worker is running.",
    search: (c, l) => `https://www.yellowpages.co.za/search?what=${q(c)}&where=${q(l)}`,
  },
  {
    id: "mba_kzn",
    label: "Master Builders KZN",
    tiers: [1],
    reliability: "good",
    needsBrowser: false,
    note: "Member list for KZN builders. Small but exactly the right kind of business — owner-run and already paying for a membership.",
    search: () => "https://www.masterbuilders.co.za/members",
  },
  {
    id: "google_maps",
    label: "Google Maps listings",
    tiers: [1, 2, 3],
    reliability: "hostile",
    needsBrowser: true,
    note: "Richest source, hardest to reach. The free Places API needs a billing card on file, so this is browser scraping only, from the local worker, at low volume. Expect it to find nothing on a bad day.",
    search: (c, l) => `https://www.google.com/maps/search/${q(`${c} ${l}`)}`,
  },
  {
    id: "facebook_pages",
    label: "Facebook Pages",
    tiers: [1, 2, 3],
    reliability: "hostile",
    needsBrowser: true,
    note: "The single best signal that a business is alive and trying to market itself — and the hardest to get at since the Graph API locked down. Public page HTML only, from the local worker, and Meta rate-limits it aggressively.",
    search: (c, l) => `https://www.facebook.com/search/pages/?q=${q(`${c} ${l}`)}`,
  },
  {
    id: "sa_venues",
    label: "SA-Venues",
    tiers: [3],
    reliability: "good",
    needsBrowser: false,
    note: "Guest houses and lodges with contact details published on the listing. The best Tier 3 source.",
    search: (c, l) => `https://www.sa-venues.com/accommodation/${q(l.toLowerCase().replace(/\s+/g, ""))}.php`,
  },
  {
    id: "lekkeslaap",
    label: "LekkeSlaap",
    tiers: [3],
    reliability: "fragile",
    needsBrowser: false,
    note: "Afrikaans-first accommodation directory. Good coverage of small family-run places that are exactly the direct-booking pitch.",
    search: (c, l) => `https://www.lekkeslaap.co.za/soek?q=${q(l)}`,
  },
  {
    id: "safarinow",
    label: "SafariNow",
    tiers: [3],
    reliability: "fragile",
    needsBrowser: false,
    note: "Heavy OTA presence, which is the point — these are the places paying commission.",
    search: (c, l) => `https://www.safarinow.com/destinations/${q(l.toLowerCase().replace(/\s+/g, "-"))}/`,
  },
  {
    id: "nightsbridge",
    label: "NightsBridge",
    tiers: [3],
    reliability: "fragile",
    needsBrowser: false,
    note: "Booking engine used by many small SA guest houses. A NightsBridge widget on a dated site is a direct-booking conversation waiting to happen.",
    search: (c, l) => `https://www.nightsbridge.co.za/search?location=${q(l)}`,
  },
];

/**
 * The hosts that belong to a directory rather than to a business.
 *
 * Derived from the sources' own search URLs rather than written out again, so
 * adding a source cannot forget to add it here.
 *
 * Needed because a listing page carries the directory's own contact details as
 * well as the business's — a Snupit listing has Snupit's address in its footer,
 * and nothing distinguished the two. Picked up as "published" it would be
 * written to the lead and then written to, which means an outreach email
 * addressed to a business and delivered to the directory that listed it.
 */
export const DIRECTORY_HOSTS: string[] = [
  ...new Set(
    SOURCES.map((s) => {
      try {
        return new URL(s.search("category", "location")).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return "";
      }
    }).filter(Boolean),
  ),
];

export function isDirectoryHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const clean = host.replace(/^www\./, "").toLowerCase();
  return DIRECTORY_HOSTS.some((d) => clean === d || clean.endsWith(`.${d}`));
}

/**
 * Is this the name of a business, or of the page we read it off?
 *
 * The business name is taken from an h1 or a page title, and on a page that
 * turned out not to be a business listing that produces a lead called
 * "Google Maps" (a tiling contractor in Margate), "Request a Quote" (a builder
 * in Durban), or the directory itself. Each one was fetched, audited, judged by
 * the model and written to the database before anything noticed.
 *
 * They score zero and are discarded, so they never reach a prospect — this is
 * about not spending a run and a model call to find that out, and about a lead
 * list you can read without wondering what half of it is.
 */
const NOT_A_BUSINESS = [
  "request a quote", "get a quote", "contact us", "contact", "about us", "about",
  "home", "homepage", "search", "search results", "results", "sign in", "log in",
  "login", "register", "menu", "privacy policy", "terms", "terms and conditions",
  "page not found", "not found", "404", "untitled", "untitled document",
  "index", "directory", "listings", "categories", "welcome",
];

/** "snupit", "masterbuilders", "google"… — a directory's name, not a business's. */
const DIRECTORY_BRANDS: string[] = [
  ...new Set(DIRECTORY_HOSTS.map((h) => h.split(".")[0].replace(/[^a-z0-9]/g, ""))),
];

export function looksLikeBusinessName(name: string): boolean {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 3) return false;

  const words = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!words) return false;
  if (NOT_A_BUSINESS.includes(words)) return false;

  // A real business is never named after the directory that lists it. Anchored
  // to the start so a plumber is not rejected for mentioning one.
  const squashed = words.replace(/\s+/g, "");
  if (DIRECTORY_BRANDS.some((brand) => brand.length >= 5 && squashed.startsWith(brand))) {
    return false;
  }
  return true;
}

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function sourcesForTier(tier: TierNum, includeBrowser: boolean): Source[] {
  return SOURCES.filter((s) => s.tiers.includes(tier) && (includeBrowser || !s.needsBrowser));
}

/** Search terms per tier, as the bots would actually type them. */
export const TIER_CATEGORIES: Record<TierNum, string[]> = {
  1: [
    "builder", "building contractor", "renovations", "plumber", "electrician",
    "roofing contractor", "paving contractor", "retaining walls", "waterproofing",
    "carpenter", "painter and decorator", "tiling contractor",
  ],
  2: ["solar installer", "solar panel installation", "inverter installation", "solar geyser"],
  3: ["guest house", "bed and breakfast", "self catering", "lodge", "guest lodge"],
};

/** KZN first — that is where Taine is and where a site visit is possible. */
export const LOCATIONS = [
  "Durban", "Pinetown", "Westville", "Hillcrest", "Kloof", "Umhlanga", "Ballito",
  "Amanzimtoti", "Pietermaritzburg", "Hibberdene", "Richards Bay", "Margate",
];
