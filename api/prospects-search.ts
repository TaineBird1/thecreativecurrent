import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { discoverPlaces } from "./_lib/placesDiscovery.js";
import type { ProspectSearchApiResponse, ProspectSearchResult } from "../src/lib/prospects.js";

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

  let places;
  try {
    places = await discoverPlaces(category, location, apiKey);
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : "Google Places search failed",
    } satisfies ProspectSearchApiResponse);
    return;
  }

  const results: ProspectSearchResult[] = places.map((p) => ({
    placeId: p.placeId,
    businessName: p.businessName,
    phone: p.phone,
    address: p.address,
    mapsUrl: p.mapsUrl,
    hasWebsite: p.hasWebsite,
    website: p.website,
    pageSpeedScore: p.pageSpeedScore,
    isPoorWebsite: p.isPoorWebsite,
  }));

  res.status(200).json({ ok: true, results } satisfies ProspectSearchApiResponse);
}
