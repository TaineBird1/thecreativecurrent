export const prospectSources = ["places_api", "manual"] as const;
export type ProspectSource = (typeof prospectSources)[number];

export const prospectStatuses = ["new", "drafted", "approved", "sent", "replied", "won", "lost"] as const;
export type ProspectStatus = (typeof prospectStatuses)[number];

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
};

export type ProspectSearchResult = {
  placeId: string;
  businessName: string;
  phone: string | null;
  address: string | null;
  mapsUrl: string | null;
  hasWebsite: boolean;
  website: string | null;
};

export type ProspectSearchApiResponse =
  | { ok: true; results: ProspectSearchResult[] }
  | { ok: false; error: string };

export type ProspectSendApiResponse =
  | { ok: true; prospect: Prospect }
  | { ok: false; error: string };
