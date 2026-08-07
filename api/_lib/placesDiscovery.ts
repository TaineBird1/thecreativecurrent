import { getPageSpeedScore, POOR_WEBSITE_THRESHOLD } from "./pagespeed.js";
import { extractEmailFromHtml } from "./emailScraper.js";
import { getWebsiteHealth, isWeakWebsite, type WebsiteHealth } from "./websiteHealth.js";

// Shared by api/prospects-search.ts (interactive) and api/outreach-run.ts
// (automated daily discovery) so the Google Places + PageSpeed logic only
// lives in one place.

const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

type PlaceResult = {
  place_id: string;
  name: string;
};

type TextSearchResponse = {
  status: string;
  error_message?: string;
  results?: PlaceResult[];
};

type DetailsResponse = {
  result?: {
    name?: string;
    formatted_phone_number?: string;
    formatted_address?: string;
    website?: string;
    url?: string;
    price_level?: number;
  };
};

export type DiscoveredPlace = {
  placeId: string;
  businessName: string;
  phone: string | null;
  address: string | null;
  mapsUrl: string | null;
  hasWebsite: boolean;
  website: string | null;
  pageSpeedScore: number | null;
  isPoorWebsite: boolean;
  email: string | null;
  priceLevel: number | null;
  /** null when the business has no website at all -- nothing to check. */
  websiteHealth: WebsiteHealth | null;
  /** Plain-English reason the site failed, for the prospect's notes. */
  websiteHealthDetail: string | null;
  /** The same fault phrased for the recipient, to open the outreach email with. */
  websiteEmailDefect: string | null;
};

// Google's price_level enum: 0 Free, 1 Inexpensive, 2 Moderate, 3 Expensive,
// 4 Very Expensive. Only populated for some categories (restaurants, cafes,
// retail) -- most service trades (electricians, plumbers, etc.) don't have
// it at all. Unknown (null) is treated as a PASS, not a fail -- confirmed
// via real search results that every electrician/pre-school result came
// back null, so requiring price_level to be known would have silently
// excluded those categories entirely. Only businesses Google explicitly
// marks Expensive or Very Expensive are filtered out.
const EXCLUDED_PRICE_LEVELS = [3, 4];

export function isMiddleClassPriceLevel(priceLevel: number | null): boolean {
  if (priceLevel === null) return true;
  return !EXCLUDED_PRICE_LEVELS.includes(priceLevel);
}

export async function discoverPlaces(category: string, location: string, apiKey: string): Promise<DiscoveredPlace[]> {
  const query = `${category} in ${location}`;
  const searchUrl = `${TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = (await searchRes.json()) as TextSearchResponse;

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${searchData.status} ${searchData.error_message || ""}`);
  }

  const results: PlaceResult[] = (searchData.results || []).slice(0, 20);

  return Promise.all(
    results.map(async (place) => {
      const fields = "name,formatted_phone_number,formatted_address,website,url,place_id,price_level";
      const detailsUrl = `${DETAILS_URL}?place_id=${place.place_id}&fields=${fields}&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = (await detailsRes.json()) as DetailsResponse;
      const d = detailsData.result ?? {};

      const website = d.website || null;
      let pageSpeedScore: number | null = null;
      let isPoorWebsite = false;
      let email: string | null = null;
      let websiteHealth: WebsiteHealth | null = null;
      let websiteHealthDetail: string | null = null;
      let websiteEmailDefect: string | null = null;

      if (website) {
        // Google Places never returns an email -- for a business that does
        // have a website (i.e. a poor-website lead, not a no-website one),
        // its homepage is the one place worth automatically checking for a
        // contact email instead of always requiring a human to find one.
        //
        // The health check runs alongside PageSpeed rather than replacing it:
        // PageSpeed still catches the genuinely slow-but-working sites, while
        // getWebsiteHealth catches everything PageSpeed structurally cannot
        // score -- dead domains, 5xx, TLS failures, parked pages, free
        // builder subdomains -- plus the missing-viewport case, where a site
        // loads fast enough to pass PageSpeed while being unusable on a
        // phone. See websiteHealth.ts for why the score alone was wrong in
        // both directions.
        // Only TWO requests here, not three, and only ONE of them touches the
        // business's own server. getPageSpeedScore calls Google, not the site.
        // Running getWebsiteHealth and scrapeEmailFromWebsite in parallel meant
        // firing two simultaneous requests at the same small business's host --
        // often cheap shared hosting -- and that self-inflicted load produced
        // false timeouts: on a real Johannesburg run, three sites reported
        // `timeout` under concurrency and then loaded in under 4 seconds each
        // when checked individually. The health check already downloads the
        // homepage, so the email is now extracted from that same HTML.
        const [score, health] = await Promise.all([getPageSpeedScore(website), getWebsiteHealth(website)]);
        pageSpeedScore = score;
        email = health.html ? extractEmailFromHtml(health.html) : null;
        websiteHealth = health.health;
        websiteHealthDetail = health.detail;
        websiteEmailDefect = health.emailDefect;
        isPoorWebsite = isWeakWebsite(health, score, POOR_WEBSITE_THRESHOLD);
      }

      return {
        placeId: place.place_id,
        businessName: d.name || place.name,
        phone: d.formatted_phone_number || null,
        address: d.formatted_address || null,
        mapsUrl: d.url || null,
        hasWebsite: Boolean(website),
        website,
        pageSpeedScore,
        isPoorWebsite,
        email,
        priceLevel: typeof d.price_level === "number" ? d.price_level : null,
        websiteHealth,
        websiteHealthDetail,
        websiteEmailDefect,
      };
    })
  );
}
