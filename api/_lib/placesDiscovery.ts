import { getPageSpeedScore, POOR_WEBSITE_THRESHOLD } from "./pagespeed.js";

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
};

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
      const fields = "name,formatted_phone_number,formatted_address,website,url,place_id";
      const detailsUrl = `${DETAILS_URL}?place_id=${place.place_id}&fields=${fields}&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = (await detailsRes.json()) as DetailsResponse;
      const d = detailsData.result ?? {};

      const website = d.website || null;
      let pageSpeedScore: number | null = null;
      let isPoorWebsite = false;

      if (website) {
        pageSpeedScore = await getPageSpeedScore(website);
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
      };
    })
  );
}
