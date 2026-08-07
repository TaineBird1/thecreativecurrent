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
  /** Human-readable specifics for the prospect's notes field. */
  detail: string | null;
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

function classifyNetworkError(code: string | null): { health: WebsiteHealth; detail: string } {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return { health: "dns_failure", detail: "Domain does not resolve (DNS lookup failed) -- the domain has lapsed or was never pointed anywhere." };
    case "ECONNREFUSED":
      return { health: "connection_refused", detail: "Domain resolves but the server refuses connections -- nothing is being served." };
    case "ECONNRESET":
      return { health: "connection_refused", detail: "Connection reset by the server before any response was returned." };
    case "CERT_HAS_EXPIRED":
      return { health: "tls_error", detail: "HTTPS certificate has expired -- every browser shows a full-page security warning before the site can be seen." };
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return { health: "tls_error", detail: "HTTPS certificate does not cover this domain -- every browser blocks the page with a security warning." };
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return { health: "tls_error", detail: "HTTPS certificate is self-signed or untrusted -- browsers block the page." };
    default:
      return { health: "connection_refused", detail: `Site unreachable${code ? ` (${code})` : ""}.` };
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
      };
    }

    const hasViewport = /<meta[^>]+name=["']?viewport["']?/i.test(body);

    return {
      health: "live",
      statusCode: res.status,
      finalUrl: res.url || url,
      hasViewport,
      detail: hasViewport ? null : "No mobile viewport meta tag -- the page renders at desktop width on a phone.",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        health: "timeout",
        statusCode: null,
        finalUrl: null,
        hasViewport: false,
        detail: `No response within ${REQUEST_TIMEOUT_MS / 1000}s.`,
      };
    }
    const { health, detail } = classifyNetworkError(networkErrorCode(err));
    return { health, statusCode: null, finalUrl: null, hasViewport: false, detail };
  } finally {
    clearTimeout(timeout);
  }
}

/** Anything other than a healthy, mobile-ready page is a prospect. */
export function isWeakWebsite(result: WebsiteHealthResult, pageSpeedScore: number | null, poorThreshold: number): boolean {
  if (result.health !== "live") return true;
  if (!result.hasViewport) return true;
  return pageSpeedScore !== null && pageSpeedScore < poorThreshold;
}
