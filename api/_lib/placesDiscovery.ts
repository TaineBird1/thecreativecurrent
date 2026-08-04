import { getPageSpeedScore, POOR_WEBSITE_THRESHOLD } from "./pagespeed.js";
import { scrapeEmailFromWebsite } from "./emailScraper.js";

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
};

// Google's price_level enum: 0 Free, 1 Inexpensive, 2 Moderate, 3 Expensive,
// 4 Very Expensive. Only populated for some categories (restaurants, cafes,
// retail) -- most service trades (electricians, plumbers, etc.) don't have
// it at all, so this filter will exclude those categories almost entirely.
export const MIDDLE_CLASS_PRICE_LEVEL = 2;

export function isMiddleClassPriceLevel(priceLevel: number | null): boolean {
  return priceLevel === MIDDLE_CLASS_PRICE_LEVEL;
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

      if (website) {
        // Google Places never returns an email -- for a business that does
        // have a website (i.e. a poor-website lead, not a no-website one),
        // its homepage is the one place worth automatically checking for a
        // contact email instead of always requiring a human to find one.
        [pageSpeedScore, email] = await Promise.all([getPageSpeedScore(website), scrapeEmailFromWebsite(website)]);
        isPoorWebsite = pageSpeedScore !== null && pageSpeedScore < POOR_WEBSITE_THRESHOLD;
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
      };
    })
  );
}
