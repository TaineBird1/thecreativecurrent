import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ProspectCard } from "./components/ProspectCard";
import type {
  Prospect,
  ProspectSearchApiResponse,
  ProspectSearchResult,
  ProspectStatus,
  SavedSearch,
} from "../lib/prospects";

// Google's price_level: 0 Free, 1 Inexpensive, 2 Moderate, 3 Expensive,
// 4 Very Expensive -- 2 (Moderate) is what the automated daily run treats
// as "middle class". Only populated for some categories (restaurants,
// cafes, retail); most service trades never have it, hence "no price data".
function priceLevelLabel(priceLevel: number | null): string {
  if (priceLevel === null) return "no price data";
  if (priceLevel === 0) return "Free";
  const symbols = "$".repeat(priceLevel);
  return priceLevel === 2 ? `${symbols} (Moderate)` : symbols;
}

export function AdminOutreach() {
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("Durban");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProspectSearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "">("");

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch, setSavingSearch] = useState(false);

  async function loadProspects() {
    setLoading(true);
    let query = supabase.from("prospects").select("*").order("created_at", { ascending: false });
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data } = await query;
    setProspects((data as Prospect[]) ?? []);
    setLoading(false);
  }

  async function loadSavedSearches() {
    const { data } = await supabase.from("saved_searches").select("*").order("created_at", { ascending: false });
    setSavedSearches((data as SavedSearch[]) ?? []);
  }

  useEffect(() => {
    loadProspects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    loadSavedSearches();
  }, []);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/prospects-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, location }),
      });
      const data: ProspectSearchApiResponse = await res.json();
      if (!data.ok) {
        setSearchError(data.error);
        return;
      }
      setResults(data.results);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function addProspect(r: ProspectSearchResult) {
    const { error } = await supabase.from("prospects").insert({
      business_name: r.businessName,
      category: category || null,
      phone: r.phone,
      address: r.address,
      maps_url: r.mapsUrl,
      place_id: r.placeId,
      website: r.website,
      email: r.email,
      page_speed_score: r.pageSpeedScore,
      reason: "poor_website",
      source: "places_api",
    });
    if (!error) {
      setAddedIds((prev) => new Set(prev).add(r.placeId));
      loadProspects();
    }
  }

  async function saveCurrentSearch() {
    if (!category || !location) return;
    setSavingSearch(true);
    await supabase.from("saved_searches").upsert({ category, location }, { onConflict: "category,location" });
    await loadSavedSearches();
    setSavingSearch(false);
  }

  async function removeSavedSearch(id: number) {
    await supabase.from("saved_searches").delete().eq("id", id);
    loadSavedSearches();
  }

  // Targeting policy (whole system, not just automated generation): only
  // businesses with an existing-but-poor website AND a found email are
  // real leads here. No-website results are shown for transparency but
  // never addable; poor-website-with-no-email likewise -- consistent with
  // what api/outreach-run.ts already enforces for automated generation.
  const needsUpdateResults = (results ?? []).filter((r) => r.hasWebsite && r.isPoorWebsite && r.email);
  const needsUpdateNoEmailResults = (results ?? []).filter((r) => r.hasWebsite && r.isPoorWebsite && !r.email);
  const noWebsiteResults = (results ?? []).filter((r) => !r.hasWebsite);
  const goodWebsiteResults = (results ?? []).filter((r) => r.hasWebsite && !r.isPoorWebsite);
  const alreadySaved = savedSearches.some((s) => s.category === category && s.location === location);

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl font-bold">Outreach</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find local businesses whose website needs updating and have a contactable email on file, draft a
            personalized email, and review it before anything sends.
          </p>
        </div>
        <Link
          to="/admin/outreach/review"
          className="shrink-0 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Daily Review
        </Link>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Search</h2>
        </div>
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-4 p-6">
          <div className="grid gap-2">
            <label htmlFor="o-category" className="text-sm text-muted-foreground">
              Category
            </label>
            <input
              id="o-category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. plumbers"
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="o-location" className="text-sm text-muted-foreground">
              Location
            </label>
            <input
              id="o-location"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
          <button
            type="button"
            onClick={saveCurrentSearch}
            disabled={savingSearch || !category || !location || alreadySaved}
            className="h-11 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {alreadySaved ? "Saved" : "Save this search"}
          </button>
        </form>

        {savedSearches.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
            {savedSearches.map((s) => (
              <span
                key={s.id}
                className="flex items-center gap-2 rounded-full border border-border bg-black px-3 py-1 text-xs text-muted-foreground"
              >
                {s.category} in {s.location}
                <button
                  type="button"
                  onClick={() => removeSavedSearch(s.id)}
                  className="text-muted-foreground hover:text-red-400"
                  aria-label={`Remove saved search ${s.category} in ${s.location}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {searchError && (
          <p role="alert" className="px-6 pb-6 text-sm text-red-500">
            {searchError}
          </p>
        )}

        {results && (
          <div className="space-y-6 border-t border-border p-6">
            <div>
              <h3 className="mb-3 font-sans text-sm font-semibold">
                Websites that need updating ({needsUpdateResults.length})
              </h3>
              {needsUpdateResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None in this batch — try a different area or category.
                </p>
              ) : (
                <div className="space-y-2">
                  {needsUpdateResults.map((r) => (
                    <div
                      key={r.placeId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-black px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{r.businessName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          PageSpeed score {r.pageSpeedScore} · {priceLevelLabel(r.priceLevel)} · {r.address}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-primary">✓ Email found: {r.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addProspect(r)}
                        disabled={addedIds.has(r.placeId)}
                        className="shrink-0 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                      >
                        {addedIds.has(r.placeId) ? "Added" : "Add as lead"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {needsUpdateNoEmailResults.length > 0 && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  {needsUpdateNoEmailResults.length} more have a website that needs updating, but no email was found
                  (not shown as leads — no way to contact them yet)
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {needsUpdateNoEmailResults.map((r) => (
                    <li key={r.placeId}>
                      {r.businessName} — PageSpeed score {r.pageSpeedScore}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {noWebsiteResults.length > 0 && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  {noWebsiteResults.length} result{noWebsiteResults.length === 1 ? "" : "s"} have no website at all
                  (not targeted — no site to update, no email to find)
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {noWebsiteResults.map((r) => (
                    <li key={r.placeId}>{r.businessName}</li>
                  ))}
                </ul>
              </details>
            )}

            {goodWebsiteResults.length > 0 && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  {goodWebsiteResults.length} result{goodWebsiteResults.length === 1 ? "" : "s"} already have a good
                  website (skip these)
                </summary>
                <ul className="mt-2 space-y-1 pl-4">
                  {goodWebsiteResults.map((r) => (
                    <li key={r.placeId}>{r.businessName}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Prospects ({prospects.length})</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | "")}
            className="h-9 rounded-lg border border-border bg-black px-3 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="drafted">Drafted</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
            <option value="replied">Replied</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </div>
        <div className="space-y-4 p-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : prospects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No prospects yet — search above to find some.</p>
          ) : (
            prospects.map((p) => <ProspectCard key={p.id} prospect={p} onChange={loadProspects} />)
          )}
        </div>
      </section>
    </div>
  );
}
