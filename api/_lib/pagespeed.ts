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

// A real PageSpeed audit can take anywhere from a few seconds to 60-90+
// seconds for a genuinely slow site -- exactly the sites this feature is
// looking for. Left unbounded, one slow audit stalls the whole search/run
// well past any reasonable request timeout. Capped at 8s: a timeout is
// treated the same as any other failure (null score, not counted as poor).
const PAGESPEED_TIMEOUT_MS = 8000;

export async function getPageSpeedScore(url: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${PAGESPEED_URL}?url=${encodeURIComponent(url)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as PageSpeedResponse;
    const score = data.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    return Math.round(score * 100);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Below this, a site counts as "poor" and becomes a lead too.
export const POOR_WEBSITE_THRESHOLD = 50;
