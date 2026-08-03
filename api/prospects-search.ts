import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import type { ProspectSearchApiResponse, ProspectSearchResult } from "../src/lib/prospects.js";

// Server-only lead discovery: searches Google Places for a category +
// location, then fetches details on each result to check whether it lists
// a website. Two Google API calls are needed because Text Search doesn't
// return "website" -- only Place Details does.

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectSearchApiResponse);
    return;
  }

  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectSearchApiResponse);
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: "GOOGLE_PLACES_API_KEY is not set" } satisfies ProspectSearchApiResponse);
    return;
  }

  const { category, location } = (req.body ?? {}) as { category?: string; location?: string };
  if (!category || !location) {
    res
      .status(400)
      .json({ ok: false, error: "category and location are required" } satisfies ProspectSearchApiResponse);
    return;
  }

  const query = `${category} in ${location}`;
  const searchUrl = `${TEXT_SEARCH_URL}?query=${encodeURIComponent(query)}&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = (await searchRes.json()) as TextSearchResponse;

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    res.status(502).json({
      ok: false,
      error: `Google Places error: ${searchData.status} ${searchData.error_message || ""}`,
    } satisfies ProspectSearchApiResponse);
    return;
  }

  const results: PlaceResult[] = (searchData.results || []).slice(0, 20);

  const detailed: ProspectSearchResult[] = await Promise.all(
    results.map(async (place) => {
      const fields = "name,formatted_phone_number,formatted_address,website,url,place_id";
      const detailsUrl = `${DETAILS_URL}?place_id=${place.place_id}&fields=${fields}&key=${apiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = (await detailsRes.json()) as DetailsResponse;
      const d = detailsData.result ?? {};
      return {
        placeId: place.place_id,
        businessName: d.name || place.name,
        phone: d.formatted_phone_number || null,
        address: d.formatted_address || null,
        mapsUrl: d.url || null,
        hasWebsite: Boolean(d.website),
        website: d.website || null,
      };
    })
  );

  res.status(200).json({ ok: true, results: detailed } satisfies ProspectSearchApiResponse);
}
