/**
 * The site fault audit — the sales wedge.
 *
 * Every fault produces a plain sentence that Outreach can paste into an email
 * to the owner verbatim. That constraint shapes the whole module: "your site
 * scores 34/100" is useless to a roofer, "your site takes 8.4 seconds to load
 * on a phone" gets a reply.
 *
 * Nothing here guesses. A fault is only recorded when it is observable in the
 * fetched HTML or the measured timing. A fault we cannot check from HTML alone
 * (real mobile rendering, broken links) is left to the Playwright worker, which
 * genuinely can.
 */
import { stripTags, metaContent, links, images, title } from "./html";

export type Severity = "high" | "medium" | "low";

export interface Fault {
  code: string;
  detail: string;
  severity: Severity;
}

export interface AuditInput {
  url: string;
  finalUrl: string;
  html: string;
  seconds: number;
  status: number;
  /** Supplied by the Playwright worker when it ran the audit; absent otherwise. */
  mobileOverflowPx?: number;
  brokenLinks?: string[];
}

/** Slower than this on a phone and people leave. Not a guess — it is the rule of thumb. */
const SLOW_SECONDS = 3.0;

export function auditSite(input: AuditInput): { faults: Fault[]; notes: string[] } {
  const faults: Fault[] = [];
  const notes: string[] = [];
  const { html, finalUrl, seconds } = input;
  const text = stripTags(html).toLowerCase();
  const allLinks = links(html, finalUrl);

  // ── HTTPS ────────────────────────────────────────────────────────────────
  if (finalUrl.startsWith("http://")) {
    faults.push({
      code: "http_not_https",
      detail:
        "The site still loads over http, so Chrome shows a 'Not secure' warning next to your address.",
      severity: "high",
    });
  }

  // ── Mobile ───────────────────────────────────────────────────────────────
  const viewport = metaContent(html, "viewport");
  if (!viewport) {
    faults.push({
      code: "not_mobile_responsive",
      detail:
        "The site isn't built to resize on a phone — you have to pinch and scroll sideways to read it.",
      severity: "high",
    });
  } else if (input.mobileOverflowPx && input.mobileOverflowPx > 20) {
    faults.push({
      code: "not_mobile_responsive",
      detail: `On a phone the page is about ${Math.round(input.mobileOverflowPx)}px wider than the screen, so it scrolls sideways.`,
      severity: "high",
    });
  }

  // ── Speed ────────────────────────────────────────────────────────────────
  if (seconds > SLOW_SECONDS) {
    faults.push({
      code: "slow_load",
      detail: `The homepage takes ${seconds.toFixed(1)} seconds to load.`,
      severity: seconds > 6 ? "high" : "medium",
    });
  }

  // ── Getting hold of them ─────────────────────────────────────────────────
  const hasForm = /<form\b/i.test(html) || /<input[^>]+type=["']?(?:email|text)/i.test(html);
  if (!hasForm) {
    faults.push({
      code: "no_contact_form",
      detail:
        "There's no contact or enquiry form anywhere on the site — someone who wants a quote has to find another way to reach you.",
      severity: "high",
    });
  }

  const hasTelLink = /href=["']tel:/i.test(html);
  if (!hasTelLink) {
    faults.push({
      code: "no_click_to_call",
      detail: "Your phone number isn't tappable on a phone — people have to copy it out by hand.",
      severity: "medium",
    });
  }

  const hasWhatsApp = /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(html);
  if (!hasWhatsApp) {
    faults.push({
      code: "no_whatsapp_button",
      detail: "There's no WhatsApp button, which is how most people would rather message a contractor.",
      severity: "medium",
    });
  }

  // ── Trust signals ────────────────────────────────────────────────────────
  const hasAddress =
    /\b(?:street|road|rd\b|avenue|ave\b|drive|dr\b|crescent|lane|boulevard|park)\b/i.test(text) &&
    /\b\d{1,4}\b/.test(text);
  if (!hasAddress) {
    faults.push({
      code: "no_visible_address",
      detail: "There's no physical address on the site, which makes a local business look less real.",
      severity: "medium",
    });
  }

  const hasGbp = allLinks.some((l) => /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page/i.test(l));
  if (!hasGbp) {
    faults.push({
      code: "no_gbp_link",
      detail: "The site doesn't link to your Google listing, so it isn't feeding your Maps profile.",
      severity: "low",
    });
  }

  const imgs = images(html);
  const galleryish = imgs.filter((i) => !/logo|icon|sprite|pixel|badge/i.test(i.src));
  if (galleryish.length < 4) {
    faults.push({
      code: "no_gallery",
      detail: `There are only ${galleryish.length} real photo${galleryish.length === 1 ? "" : "s"} on the site — for your trade the work itself is the selling point.`,
      severity: "medium",
    });
  }

  // ── Neglect signals ──────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const copyright = /(?:©|&copy;|copyright)[^\d]{0,20}((?:19|20)\d{2})/i.exec(html);
  if (copyright) {
    const found = Number(copyright[1]);
    if (found < year - 1) {
      faults.push({
        code: "stale_copyright",
        detail: `The footer still says ${found}, which tells visitors nobody has touched the site in a while.`,
        severity: "low",
      });
    }
  }

  if (input.brokenLinks && input.brokenLinks.length > 0) {
    faults.push({
      code: "broken_links",
      detail: `${input.brokenLinks.length} link${input.brokenLinks.length === 1 ? "" : "s"} on the site go${input.brokenLinks.length === 1 ? "es" : ""} to a page that doesn't exist.`,
      severity: "medium",
    });
  }

  // ── Things worth noting but not worth calling a fault ─────────────────────
  if (!title(html)) notes.push("The page has no <title>, so it shows as the raw URL in search results.");
  if (!metaContent(html, "description")) notes.push("No meta description.");
  if (/wix\.com|squarespace|weebly/i.test(html)) notes.push("Built on a drag-and-drop builder.");
  if (/wp-content|wordpress/i.test(html)) notes.push("WordPress.");

  return { faults, notes };
}

/**
 * Qualification score, 0-100.
 *
 * Weighted so that "fixable problems + clearly trading + reachable" scores high.
 * A perfect modern site scores low — correctly, because they do not need us.
 */
export function scoreLead(input: {
  tier: 1 | 2 | 3;
  hasWebsite: boolean;
  faults: Fault[];
  reachableChannels: number;
  facebookActive: boolean;
}): number {
  let score = 0;

  // Tier 1 is the priority niche.
  score += input.tier === 1 ? 25 : input.tier === 2 ? 20 : 15;

  // Fixable faults are the opportunity. High-severity ones are the pitch.
  const high = input.faults.filter((f) => f.severity === "high").length;
  const medium = input.faults.filter((f) => f.severity === "medium").length;
  score += Math.min(35, high * 12 + medium * 5);

  // No website at all is a strong signal, but only if their Facebook proves
  // they are trading — otherwise it is just a business that does not exist yet.
  if (!input.hasWebsite) score += input.facebookActive ? 25 : 5;

  // Proof they are alive and already trying to market themselves.
  if (input.facebookActive) score += 15;

  // Reachability. A lead we cannot contact is worth nothing regardless.
  score += Math.min(15, input.reachableChannels * 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** The single fault most worth leading an email with. */
export function headlineFault(faults: Fault[]): Fault | null {
  const order: Severity[] = ["high", "medium", "low"];
  for (const sev of order) {
    // These three are the most concrete and the least insulting to raise.
    const preferred = ["slow_load", "not_mobile_responsive", "no_contact_form"];
    const match = faults.find((f) => f.severity === sev && preferred.includes(f.code));
    if (match) return match;
    const any = faults.find((f) => f.severity === sev);
    if (any) return any;
  }
  return null;
}
