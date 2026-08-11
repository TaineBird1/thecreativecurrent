import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { discoverPlaces } from "./_lib/placesDiscovery.js";
import type { ProspectSearchApiResponse, ProspectSearchResult } from "../src/lib/prospects.js";

const PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";

// Two unrelated jobs share this file rather than getting a file each --
// Vercel's Hobby plan caps a deployment at 12 serverless functions total
// (see CLAUDE.md), so a new endpoint means either freeing up a slot or
// branching an existing one. POST is the pre-existing admin-only search;
// GET is new: a public photo proxy so `<img>` tags can show a prospect's
// Google Places photo without the API key ever reaching the browser --
// Google's own Photo endpoint requires the key in the URL, which a plain
// `<img src>` would expose in the page's network requests.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      res.status(500).send("not configured");
      return;
    }
    const ref = typeof req.query.ref === "string" ? req.query.ref : undefined;
    if (!ref) {
      res.status(400).send("ref is required");
      return;
    }

    try {
      const photoRes = await fetch(
        `${PHOTO_URL}?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`
      );
      if (!photoRes.ok || !photoRes.body) {
        res.status(502).send("photo fetch failed");
        return;
      }
      const buffer = Buffer.from(await photoRes.arrayBuffer());
      res.setHeader("Content-Type", photoRes.headers.get("content-type") || "image/jpeg");
      // A day is plenty -- these are Google's own storefront/listing photos,
      // not something that needs to be fresh, and it saves re-fetching the
      // same image every time the board re-renders.
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(200).send(buffer);
    } catch {
      res.status(502).send("photo fetch failed");
    }
    return;
  }

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
    email: p.email,
    priceLevel: p.priceLevel,
    websiteHealth: p.websiteHealth,
    websiteHealthDetail: p.websiteHealthDetail,
    photoReference: p.photoReference,
  }));

  res.status(200).json({ ok: true, results } satisfies ProspectSearchApiResponse);
}
