// Best-effort: fetches a business's homepage and looks for a contact email.
// Only ever called for results that already have a website -- a no-website
// lead has nothing to scrape by definition, so this only ever helps the
// "poor website" segment. Same reasoning as pagespeed.ts's timeout: a slow
// or unresponsive site must not stall the whole search, so any failure
// (timeout, non-HTML response, no match) just returns null rather than
// throwing.
const SCRAPE_TIMEOUT_MS = 8000;

const IGNORED_DOMAINS = [
  "sentry.io",
  "wixpress.com",
  "godaddy.com",
  "schema.org",
  "w3.org",
  "example.com",
  "yourdomain.com",
  "domain.com",
  "email.com",
];

function isLikelyRealEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  if (IGNORED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
  // Filenames that happen to match the email shape (e.g. logo@2x.png).
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) return false;
  return true;
}

/**
 * The matching half of the scrape, split out so a caller that has already
 * downloaded the page can reuse that HTML instead of fetching it a second
 * time. getWebsiteHealth downloads the same homepage, and firing two
 * simultaneous requests at one small business's server was itself causing
 * spurious timeouts -- see the concurrency note in placesDiscovery.
 */
export function extractEmailFromHtml(html: string): string | null {
  // A mailto: link is a much stronger signal than a bare text match --
  // prefer it, and only fall back to scanning visible text for an
  // "@"-shaped string if no mailto: link is present.
  const mailtoMatch = html.match(/mailto:([^"'?\s)]+)/i);
  if (mailtoMatch) {
    const email = decodeURIComponent(mailtoMatch[1]).trim();
    if (isLikelyRealEmail(email)) return email;
  }

  const textMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (textMatch && isLikelyRealEmail(textMatch[0])) return textMatch[0];

  return null;
}

export async function scrapeEmailFromWebsite(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      console.error(`scrapeEmailFromWebsite: ${url} responded ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      console.error(`scrapeEmailFromWebsite: ${url} content-type was "${contentType}", not HTML`);
      return null;
    }
    return extractEmailFromHtml(await res.text());
  } catch (e) {
    console.error(`scrapeEmailFromWebsite failed for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
