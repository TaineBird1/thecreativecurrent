import { z } from "zod";

export const trackEventSchema = z.object({
  site_key: z.string().trim().uuid(),
  visitor_id: z.string().trim().uuid(),
  event_type: z.enum(["pageview", "heartbeat", "conversion"]),
  page_path: z.string().trim().max(2048).optional(),
  referrer: z.string().trim().max(2048).optional(),
  // Only meaningful for 'conversion' -- a pageview/heartbeat with a value
  // is just ignored by api/track.ts rather than rejected, since this is a
  // public endpoint and there's no reason to be strict about it.
  value: z.number().positive().max(1_000_000_000).optional(),
  label: z.string().trim().max(200).optional(),
});

export type TrackEventPayload = z.infer<typeof trackEventSchema>;

export type TrackApiResponse = { ok: true } | { ok: false; error: string; issues?: unknown };

export type AnalyticsEventRow = {
  id: number;
  customer_id: number;
  visitor_id: string;
  event_type: "pageview" | "heartbeat" | "conversion";
  page_path: string | null;
  referrer: string | null;
  value: number | null;
  label: string | null;
  created_at: string;
};

export const LIVE_WINDOW_SECONDS = 90;
