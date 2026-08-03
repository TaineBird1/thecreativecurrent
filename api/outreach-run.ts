import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { discoverPlaces } from "./_lib/placesDiscovery.js";
import { buildOutreachDraft } from "../src/lib/outreachTemplate.js";
import type { ProspectRunApiResponse } from "../src/lib/prospects.js";

// Runs every saved search, adds any new leads (no-website or poor-website),
// and auto-generates a draft for each new one. Never sends anything -- leads
// land in "drafted" status, ready for the review page's explicit send step.
async function runAllSearches() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { ok: false as const, error: "GOOGLE_PLACES_API_KEY is not set" };
  }

  const supabase = getSupabaseAdmin();
  const { data: savedSearches, error: searchesError } = await supabase
    .from("saved_searches")
    .select("category, location");

  if (searchesError) {
    return { ok: false as const, error: searchesError.message };
  }
  if (!savedSearches || savedSearches.length === 0) {
    return { ok: true as const, created: 0, searchesRun: 0, errors: [] };
  }

  let created = 0;
  const errors: string[] = [];

  for (const search of savedSearches as { category: string; location: string }[]) {
    try {
      const results = await discoverPlaces(search.category, search.location, apiKey);
      const opportunities = results.filter((r) => !r.hasWebsite || r.isPoorWebsite);

      for (const r of opportunities) {
        const { data: existing } = await supabase
          .from("prospects")
          .select("id")
          .eq("place_id", r.placeId)
          .maybeSingle();
        if (existing) continue;

        const reason = r.hasWebsite ? "poor_website" : "no_website";
        const { subject, body } = buildOutreachDraft(r.businessName, search.category, reason);

        const { error: insertError } = await supabase.from("prospects").insert({
          business_name: r.businessName,
          category: search.category,
          phone: r.phone,
          address: r.address,
          maps_url: r.mapsUrl,
          place_id: r.placeId,
          website: r.website,
          page_speed_score: r.pageSpeedScore,
          reason,
          source: "places_api",
          status: "drafted",
          draft_subject: subject,
          draft_body: body,
        });

        if (insertError) {
          errors.push(`${r.businessName}: ${insertError.message}`);
          continue;
        }
        created++;
      }
    } catch (e) {
      errors.push(`${search.category} in ${search.location}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return { ok: true as const, created, searchesRun: savedSearches.length, errors };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET -- this is the one Vercel Cron actually calls. Vercel doesn't verify
  // the CRON_SECRET header for you, so this route checks it itself.
  if (req.method === "GET") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ ok: false, error: "unauthorized" } satisfies ProspectRunApiResponse);
      return;
    }
    const result = await runAllSearches();
    res.status(result.ok ? 200 : 500).json(result satisfies ProspectRunApiResponse);
    return;
  }

  // POST -- used by the "Run all saved searches now" button, gated by an
  // admin session instead of the cron secret.
  if (req.method === "POST") {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      res.status(auth.status).json({ ok: false, error: auth.error } satisfies ProspectRunApiResponse);
      return;
    }
    const result = await runAllSearches();
    res.status(result.ok ? 200 : 500).json(result satisfies ProspectRunApiResponse);
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies ProspectRunApiResponse);
}
