import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { discoverPlaces, isMiddleClassPriceLevel } from "./_lib/placesDiscovery.js";
import { buildOutreachDraft } from "../src/lib/outreachTemplate.js";
import { sendOutreachDigest } from "./_lib/email.js";
import type { ProspectRunApiResponse } from "../src/lib/prospects.js";

// Runs every saved search and adds any new QUALIFIED lead: a weak or absent
// web presence, at least one way to contact them, and not a price tier Google
// explicitly marks Expensive/Very Expensive (the closest available proxy for
// "middle class"). price_level is only populated for some categories
// (restaurants, cafes, retail) -- service trades like electricians/plumbers
// rarely have it at all, so unknown is treated as a pass.
//
// An email is required to SEND, not to qualify. Leads with one get a draft
// and land in "drafted"; leads with only a phone land in "new" with no draft
// and are worked by calling. Interactive manual search (AdminOutreach.tsx) is
// intentionally not filtered this way -- a human reviewing results directly
// has full context to add whatever they want.
//
// Never sends anything. Everything waits for the review page's explicit send
// step, which itself refuses any prospect without an email on file.
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
  const newLeads: { businessName: string; category: string; sendable: boolean }[] = [];

  for (const search of savedSearches as { category: string; location: string }[]) {
    try {
      const results = await discoverPlaces(search.category, search.location, apiKey);
      // A business qualifies on the state of its web presence plus ANY way to
      // reach it -- an email is no longer required to create the lead, only to
      // send to it.
      //
      // The email requirement was excluding the strongest prospects by
      // construction: a business whose domain has lapsed has no page left to
      // scrape an address from, so the worse its web presence, the less likely
      // it could ever qualify. A Johannesburg run made the cost concrete --
      // across 40 businesses the only three real defects (two dead domains and
      // a free builder subdomain) were all rejected for having a phone but no
      // email, and the run created nothing at all.
      //
      // Leads without an email land in "new" with no draft, which is not a
      // weaker gate but a different one: prospects-send and
      // prospects-bulk-send both refuse to send without an email on file, and
      // the review page only lists "drafted", so these can never be emailed by
      // accident. They are call-first leads.
      const opportunities = results.filter(
        (r) =>
          (r.isPoorWebsite || !r.hasWebsite) &&
          (r.email !== null || r.phone !== null) &&
          isMiddleClassPriceLevel(r.priceLevel)
      );

      for (const r of opportunities) {
        const { data: existing } = await supabase
          .from("prospects")
          .select("id")
          .eq("place_id", r.placeId)
          .maybeSingle();
        if (existing) continue;

        const reason = r.hasWebsite ? "poor_website" : "no_website";
        // Only a lead with an email can be sent to, so only that lead gets a
        // draft. Generating one for a phone-only prospect would sit it in the
        // review page's checklist under a "Send selected" button with nowhere
        // to send it. Lead with the specific fault when there is one -- "your
        // domain no longer resolves" is checkable in ten seconds, unlike a
        // generic opinion about their design.
        const draft = r.email
          ? buildOutreachDraft(r.businessName, search.category, reason, r.websiteEmailDefect)
          : null;

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
          reason,
          source: "places_api",
          status: draft ? "drafted" : "new",
          draft_subject: draft?.subject ?? null,
          draft_body: draft?.body ?? null,
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
        newLeads.push({ businessName: r.businessName, category: search.category, sendable: draft !== null });
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
