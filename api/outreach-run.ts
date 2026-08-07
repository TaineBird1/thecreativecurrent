import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { discoverPlaces, isMiddleClassPriceLevel } from "./_lib/placesDiscovery.js";
import { buildOutreachDraft } from "../src/lib/outreachTemplate.js";
import { sendOutreachDigest } from "./_lib/email.js";
import type { ProspectRunApiResponse } from "../src/lib/prospects.js";

// Runs every saved search and adds any new QUALIFIED lead: must have a
// website with a scraped email on file (so a no-website lead, which by
// definition has no email, never qualifies here -- a deliberate choice, not
// an oversight) and Google's "Moderate" price tier as the closest available
// proxy for "middle class". price_level is only populated for some
// categories (restaurants, cafes, retail) -- service trades like
// electricians/plumbers rarely have it at all, so this sharply cuts how
// many categories produce anything here. Interactive manual search
// (AdminOutreach.tsx) is intentionally NOT filtered this way -- a human
// reviewing results directly has full context to add whatever they want;
// this stricter bar only applies to what gets auto-generated without a
// human looking at each result first. Auto-generates a draft for each new
// lead. Never sends anything -- leads land in "drafted" status, ready for
// the review page's explicit send step.
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
    return { ok: true as const, created: 0, searchesRun: 0, errors: [], newLeads: [] };
  }

  let created = 0;
  const errors: string[] = [];
  const newLeads: { businessName: string; category: string }[] = [];

  for (const search of savedSearches as { category: string; location: string }[]) {
    try {
      const results = await discoverPlaces(search.category, search.location, apiKey);
      const opportunities = results.filter(
        (r) => r.isPoorWebsite && r.email !== null && isMiddleClassPriceLevel(r.priceLevel)
      );

      for (const r of opportunities) {
        const { data: existing } = await supabase
          .from("prospects")
          .select("id")
          .eq("place_id", r.placeId)
          .maybeSingle();
        if (existing) continue;

        // Always "poor_website" here -- the filter above requires a website
        // (and therefore an email), so "no_website" can never be reached.
        // Lead with the specific fault when there is one -- "your domain no
        // longer resolves" is checkable in ten seconds, unlike a generic
        // opinion about their design.
        const { subject, body } = buildOutreachDraft(
          r.businessName,
          search.category,
          "poor_website",
          r.websiteEmailDefect
        );

        const { error: insertError } = await supabase.from("prospects").insert({
          business_name: r.businessName,
          category: search.category,
          phone: r.phone,
          address: r.address,
          maps_url: r.mapsUrl,
          place_id: r.placeId,
          website: r.website,
          email: r.email,
          page_speed_score: r.pageSpeedScore,
          reason: "poor_website",
          source: "places_api",
          status: "drafted",
          draft_subject: subject,
          draft_body: body,
          // The concrete, verifiable defect that made this a lead ("domain
          // does not resolve", "no mobile viewport meta tag", ...). Worth
          // storing because it is the strongest opening line available: the
          // owner can confirm it themselves in seconds, unlike a subjective
          // "your site looks dated".
          notes: r.websiteHealthDetail,
          email_defect: r.websiteEmailDefect,
        });

        if (insertError) {
          errors.push(`${r.businessName}: ${insertError.message}`);
          continue;
        }
        created++;
        newLeads.push({ businessName: r.businessName, category: search.category });
      }
    } catch (e) {
      errors.push(`${search.category} in ${search.location}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return { ok: true as const, created, searchesRun: savedSearches.length, errors, newLeads };
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
    if (result.ok && result.newLeads.length > 0) {
      // Best-effort: a failed digest email must never fail the cron run
      // itself -- the leads are already safely in the database either way.
      try {
        await sendOutreachDigest(result.newLeads);
      } catch (e) {
        console.error("Failed to send outreach digest email:", e);
      }
    }
    res.status(result.ok ? 200 : 500).json(result satisfies ProspectRunApiResponse);
    return;
  }

  // POST -- used by the "Run all saved searches now" button, gated by an
  // admin session instead of the cron secret. Doesn't send the digest --
  // whoever clicked it is already looking at the result on screen.
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
