// Free Google PageSpeed Insights API -- no separate billing required, though
// the API itself must be enabled on the same Google Cloud project as
// GOOGLE_PLACES_API_KEY (and that key's restrictions updated to allow it).
const PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

type PageSpeedResponse = {
  lighthouseResult?: {
    categories?: {
      performance?: {
        score?: number;
      };
    };
  };
};

export async function getPageSpeedScore(url: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  try {
    const res = await fetch(
      `${PAGESPEED_URL}?url=${encodeURIComponent(url)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as PageSpeedResponse;
    const score = data.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    return Math.round(score * 100);
  } catch {
    return null;
  }
}

// Below this, a site counts as "poor" and becomes a lead too.
export const POOR_WEBSITE_THRESHOLD = 50;
