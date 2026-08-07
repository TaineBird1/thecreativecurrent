export const prospectSources = ["places_api", "manual"] as const;
export type ProspectSource = (typeof prospectSources)[number];

export const prospectStatuses = ["new", "drafted", "approved", "sent", "replied", "won", "lost"] as const;
export type ProspectStatus = (typeof prospectStatuses)[number];

export const prospectReasons = ["no_website", "poor_website"] as const;
export type ProspectReason = (typeof prospectReasons)[number];

// Deterministic outcome of the site check in api/_lib/websiteHealth.ts.
// Declared here rather than there because api/*.ts already imports from
// src/lib/*, and this union is shared by the API handlers and the admin UI.
// Anything other than "live" means the site is broken rather than merely
// dated -- a concrete, verifiable defect to open an outreach email with.
export const websiteHealthStates = [
  "live",
  "dns_failure",
  "connection_refused",
  "tls_error",
  "http_error",
  "parked",
  "builder_subdomain",
  "timeout",
] as const;
export type WebsiteHealth = (typeof websiteHealthStates)[number];

// Short labels for the admin UI, so a result reads as a defect rather than
// an error code.
export const websiteHealthLabel: Record<WebsiteHealth, string> = {
  live: "Live",
  dns_failure: "Domain dead",
  connection_refused: "Server not responding",
  tls_error: "HTTPS broken",
  http_error: "Returns an error",
  parked: "Placeholder page",
  builder_subdomain: "No own domain",
  timeout: "Times out",
};

export const prospectStatusTone: Record<ProspectStatus, "neutral" | "primary" | "success" | "warning"> = {
  new: "neutral",
  drafted: "warning",
  approved: "primary",
  sent: "success",
  replied: "success",
  won: "success",
  lost: "neutral",
};

export type Prospect = {
  id: number;
  business_name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  maps_url: string | null;
  place_id: string | null;
  source: ProspectSource;
  status: ProspectStatus;
  draft_subject: string | null;
  draft_body: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  website: string | null;
  page_speed_score: number | null;
  reason: ProspectReason;
  /** Recipient-facing phrasing of the fault found on their site, if any. */
  email_defect: string | null;
  /** Set once a follow-up has gone out. Non-null means no further contact. */
  followed_up_at: string | null;
};

/**
 * How long to wait after the first email before a follow-up is offered.
 * Shared so the review page and the send endpoint can never disagree about
 * who is eligible -- the UI listing someone the API then refuses would look
 * like a bug and invite retrying.
 */
export const FOLLOW_UP_AFTER_DAYS = 7;

export type SavedSearch = {
  id: number;
  category: string;
  location: string;
  created_at: string;
};

export type ProspectSearchResult = {
  placeId: string;
  businessName: string;
  phone: string | null;
  address: string | null;
  mapsUrl: string | null;
  hasWebsite: boolean;
  website: string | null;
  pageSpeedScore: number | null;
  isPoorWebsite: boolean;
  email: string | null;
  priceLevel: number | null;
  websiteHealth: WebsiteHealth | null;
  websiteHealthDetail: string | null;
};

export type ProspectSearchApiResponse =
  | { ok: true; results: ProspectSearchResult[] }
  | { ok: false; error: string };

export type ProspectSendApiResponse =
  | { ok: true; prospect: Prospect }
  | { ok: false; error: string };

export type ProspectRunApiResponse =
  | {
      ok: true;
      created: number;
      searchesRun: number;
      errors: string[];
      /** `sendable` = an email was found, so it carries a draft; otherwise it is a call-first lead. */
      newLeads: { businessName: string; category: string; sendable: boolean }[];
    }
  | { ok: false; error: string };

export type ProspectBulkSendApiResponse =
  | { ok: true; sent: number[]; skipped: { id: number; reason: string }[] }
  | { ok: false; error: string };
