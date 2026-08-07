// Deterministic "is this website actually broken?" checks.
//
// Why this exists: pagespeed.ts alone is the wrong proxy for "needs a new
// website", in two opposite directions.
//
//   1. It MISSES the worst sites. getPageSpeedScore() returns null whenever
//      Lighthouse can't load the page at all -- a lapsed domain, a 500, an
//      expired TLS cert. placesDiscovery then evaluates
//      `score !== null && score < 50`, so null reads as "not poor" and the
//      most broken sites in the dataset are silently discarded. A business
//      whose domain no longer resolves is the single strongest prospect
//      there is, and it was the one case the filter could never see.
//
//   2. It FLAGS the wrong sites as fine. PageSpeed measures speed, not age.
//      A 2005-era fixed-width table layout with no images and no JS is
//      genuinely fast and scores well above 50, while being exactly the kind
//      of site this feature is meant to find. A parked "coming soon" page or
//      a bare Apache directory index scores near-perfect because it is
//      nearly empty.
//
// Everything here is a plain network/HTML fact -- no scoring model, no LLM,
// no judgement call. Each signal below was observed on a real South African
// small-business site during manual prospect research, not invented.

import type { WebsiteHealth } from "../../src/lib/prospects.js";

const REQUEST_TIMEOUT_MS = 8000;

export type { WebsiteHealth };

export type WebsiteHealthResult = {
  health: WebsiteHealth;
  /** Final status code after redirects, or null if the request never completed. */
  statusCode: number | null;
  /** Final URL after redirects -- differs from the input when a domain forwards elsewhere. */
  finalUrl: string | null;
  /**
   * Whether <meta name="viewport"> is present. Its absence means the page
   * renders at desktop width on a phone -- unreadable, untappable, and an
   * instant fail on mobile. Only meaningful when health is "live".
   */
  hasViewport: boolean;
  /** Human-readable specifics for the prospect's notes field (internal voice). */
  detail: string | null;
  /**
   * The same finding rewritten for the recipient, as a clause that slots into
   * an outreach email. Deliberately separate from `detail`: the notes field is
   * read by us and can say "matched 'index of /'", while this is read by the
   * business owner and must be plain, specific and non-accusatory. Null when
   * there is nothing concrete to lead with.
   */
  emailDefect: string | null;
  /**
   * The fetched page source, so callers can reuse it instead of downloading
   * the same homepage again. Null whenever the page never loaded.
   */
  html: string | null;
};

// Free site-builder / hosting subdomains. A business on one of these has no
// domain of its own, which is a sales conversation regardless of how the page
// itself looks. Matched against the hostname, so "example.wordpress.com"
// matches but a self-hosted WordPress install on its own domain does not.
const BUILDER_HOSTS = [
  "wordpress.com",
  "wixsite.com",
  "weebly.com",
  "yolasite.com",
  "business.site", // Google Business Profile sites -- Google discontinued these
  "sites.google.com",
  "blogspot.com",
  "webnode.com",
  "jimdosite.com",
  "square.site",
  "godaddysites.com",
  "comealive.co.za",
  "goto-where.com",
];

// Placeholder/default pages that return a perfectly healthy 200 while
// containing no actual website. Lowercased substring match on the body.
const PARKED_SIGNATURES = [
  "index of /", // Apache/LiteSpeed autoindex -- a domain bought and never built on
  "account suspended",
  "this account has been suspended",
  "website coming soon",
  "coming soon",
  "site to go live",
  "website to go live soon",
  "under construction",
  "upload your files", // Hostinger / cPanel default landing page
  "install wordpress",
  "future home of",
  "it works!", // default Apache
  "welcome to nginx",
  "default web site page",
  "domain is parked",
  "this domain is for sale",
  "reserved for",
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Node's fetch wraps the underlying network error, so the useful code sits on
// `cause`, not on the thrown error itself.
function networkErrorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const cause = (err as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  if ("code" in err && typeof (err as { code?: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return null;
}

function classifyNetworkError(code: string | null): { health: WebsiteHealth; detail: string; emailDefect: string } {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return {
        health: "dns_failure",
        detail: "Domain does not resolve (DNS lookup failed) -- the domain has lapsed or was never pointed anywhere.",
        emailDefect: "the domain it runs on no longer resolves, so anyone clicking through from Google or a directory listing lands on nothing at all",
      };
    case "ECONNREFUSED":
      return {
        health: "connection_refused",
        detail: "Domain resolves but the server refuses connections -- nothing is being served.",
        emailDefect: "the server behind it isn't accepting connections, so the page never loads for anyone trying to visit",
      };
    case "ECONNRESET":
      return {
        health: "connection_refused",
        detail: "Connection reset by the server before any response was returned.",
        emailDefect: "the connection drops before the page loads, so most visitors just see an error",
      };
    case "CERT_HAS_EXPIRED":
      return {
        health: "tls_error",
        detail: "HTTPS certificate has expired -- every browser shows a full-page security warning before the site can be seen.",
        emailDefect: "its security certificate has expired, so browsers now show a full-screen security warning before anyone can reach the page",
      };
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return {
        health: "tls_error",
        detail: "HTTPS certificate does not cover this domain -- every browser blocks the page with a security warning.",
        emailDefect: "its security certificate doesn't match the domain, so browsers block the page with a warning before anyone can see it",
      };
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return {
        health: "tls_error",
        detail: "HTTPS certificate is self-signed or untrusted -- browsers block the page.",
        emailDefect: "its security certificate isn't trusted by browsers, so visitors get a warning page instead of your site",
      };
    default:
      return {
        health: "connection_refused",
        detail: `Site unreachable${code ? ` (${code})` : ""}.`,
        emailDefect: "it isn't loading at all when I try to visit it",
      };
  }
}

/**
 * Best-effort. Mirrors pagespeed.ts's philosophy: never throw, never stall a
 * search. An unreachable site is a RESULT here, not an error -- that is the
 * entire point of the module.
 */
export async function getWebsiteHealth(url: string): Promise<WebsiteHealthResult> {
  const host = hostnameOf(url);
  if (host && BUILDER_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))) {
    return {
      health: "builder_subdomain",
      statusCode: null,
      finalUrl: url,
      hasViewport: false,
      detail: `No domain of their own -- the site is a free ${host.split(".").slice(-2).join(".")} subdomain.`,
      emailDefect: "it's sitting on a free hosting subdomain rather than a domain of your own, which makes it harder to find and easier to forget",
      html: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheCreativeCurrent-SiteCheck/1.0)" },
    });

    if (!res.ok) {
      // A domain that 301s away and lands on a 404 is a live sales lead: the
      // owner is paying for a domain that sends their customers nowhere.
      const redirected = res.url && res.url !== url;
      return {
        health: "http_error",
        statusCode: res.status,
        finalUrl: res.url || url,
        hasViewport: false,
        detail: redirected
          ? `Redirects to ${res.url} which returns HTTP ${res.status} -- their own domain now points at a dead page.`
          : `Returns HTTP ${res.status} -- the site is broken, not merely dated.`,
        emailDefect: redirected
          ? "your domain currently forwards to a page that no longer exists, so visitors who click through end up on an error"
          : `it's returning an error (HTTP ${res.status}) instead of loading`,
        html: null,
      };
    }

    const body = await res.text();
    const lower = body.toLowerCase();

    const parkedHit = PARKED_SIGNATURES.find((sig) => lower.includes(sig));
    if (parkedHit) {
      return {
        health: "parked",
        statusCode: res.status,
        finalUrl: res.url || url,
        hasViewport: false,
        detail: `Serves a placeholder page, not a website (matched "${parkedHit}") -- hosting is paid for but nothing is built on it.`,
        emailDefect: "the domain is live but still shows a placeholder page rather than an actual site",
        html: body,
      };
    }

    const hasViewport = /<meta[^>]+name=["']?viewport["']?/i.test(body);

    return {
      health: "live",
      statusCode: res.status,
      finalUrl: res.url || url,
      hasViewport,
      detail: hasViewport ? null : "No mobile viewport meta tag -- the page renders at desktop width on a phone.",
      emailDefect: hasViewport
        ? null
        : "it isn't set up for mobile, so on a phone it loads at full desktop width and visitors have to pinch and zoom to read anything",
      html: body,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        health: "timeout",
        statusCode: null,
        finalUrl: null,
        hasViewport: false,
        detail: `No response within ${REQUEST_TIMEOUT_MS / 1000}s.`,
        emailDefect: "it takes long enough to load that most visitors give up before it appears",
        html: null,
      };
    }
    const { health, detail, emailDefect } = classifyNetworkError(networkErrorCode(err));
    return { health, statusCode: null, finalUrl: null, hasViewport: false, detail, emailDefect, html: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Anything other than a healthy, mobile-ready page is a prospect -- EXCEPT a
 * timeout, which is inconclusive rather than a defect.
 *
 * This exception is load-bearing. A timeout says "we did not get an answer in
 * 8 seconds", which is not the same as "this site is broken", and the two are
 * easy to confuse when the checker itself is under load. Measured on a real
 * Johannesburg run: alpha-plumbing.co.za, plumbsol.co.za and dripdryplumber.com
 * all reported `timeout` while being checked concurrently, then all three came
 * back live in under 4 seconds when checked one at a time -- alpha-plumbing in
 * 515ms, with a viewport tag, a perfectly healthy site. Counting those as weak
 * would have generated outreach telling three functioning businesses their
 * website is too slow, which is both false and the fastest way to lose them.
 *
 * pagespeed.ts already takes this position for its own timeout ("a timeout is
 * treated the same as any other failure ... not counted as poor"); this brings
 * the health check into line with it. A genuinely slow site still gets caught
 * by its PageSpeed score, which is the measurement built for that job.
 */
export function isWeakWebsite(result: WebsiteHealthResult, pageSpeedScore: number | null, poorThreshold: number): boolean {
  if (result.health === "timeout") return pageSpeedScore !== null && pageSpeedScore < poorThreshold;
  if (result.health !== "live") return true;
  if (!result.hasViewport) return true;
  return pageSpeedScore !== null && pageSpeedScore < poorThreshold;
}
