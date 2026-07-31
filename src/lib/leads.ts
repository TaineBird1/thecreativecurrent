import { z } from "zod";

export const leadSources = ["home", "pricing", "contact"] as const;
export type LeadSource = (typeof leadSources)[number];

export const leadPayloadSchema = z.object({
  source: z.enum(leadSources),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().optional(),
  service_type: z.string().trim().optional(),
  message: z.string().trim().optional(),
  description: z.string().trim().optional(),
  project_details: z.string().trim().optional(),
  start_date: z.string().trim().optional(),
  preferred_date: z.string().trim().optional(),
  company_name: z.string().trim().optional(),
  newsletter: z.boolean().optional(),
  honeypot: z.string().optional(),
});

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

export type LeadApiSuccess = { ok: true; id?: number };
export type LeadApiError = { ok: false; error: string; issues?: unknown };
export type LeadApiResponse = LeadApiSuccess | LeadApiError;
