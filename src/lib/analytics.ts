import { z } from "zod";

export const trackEventSchema = z.object({
  site_key: z.string().trim().uuid(),
  visitor_id: z.string().trim().uuid(),
  event_type: z.enum(["pageview", "heartbeat"]),
  page_path: z.string().trim().max(2048).optional(),
  referrer: z.string().trim().max(2048).optional(),
});

export type TrackEventPayload = z.infer<typeof trackEventSchema>;

export type TrackApiResponse = { ok: true } | { ok: false; error: string; issues?: unknown };

export type AnalyticsEventRow = {
  id: number;
  customer_id: number;
  visitor_id: string;
  event_type: "pageview" | "heartbeat";
  page_path: string | null;
  referrer: string | null;
  created_at: string;
};

export const LIVE_WINDOW_SECONDS = 90;
