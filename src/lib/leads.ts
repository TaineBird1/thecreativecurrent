import { z } from "zod";

export const leadSources = ["home", "pricing", "contact", "appointment"] as const;
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

export type LeadRow = {
  id: number;
  created_at: string;
  source: LeadSource;
  name: string;
  email: string;
  phone: string | null;
  service_type: string | null;
  message: string | null;
  description: string | null;
  project_details: string | null;
  start_date: string | null;
  preferred_date: string | null;
  company_name: string | null;
  newsletter_opt_in: boolean | null;
};

// Sent in the background from Inquiry.tsx once someone has typed a real
// name/email/phone but hasn't hit the final Submit yet -- a much looser bar
// than leadPayloadSchema, since this fires on partial, still-changing input
// rather than an explicit submit action.
export const abandonedLeadPayloadSchema = z.object({
  source: z.enum(leadSources),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  company_name: z.string().trim().optional(),
  service_type: z.string().trim().optional(),
  project_details: z.string().trim().optional(),
  preferred_date: z.string().trim().optional(),
  step_reached: z.number().int().min(0).max(3).optional(),
  honeypot: z.string().optional(),
});

export type AbandonedLeadPayload = z.infer<typeof abandonedLeadPayloadSchema>;

export type AbandonedLeadApiResponse = { ok: true } | { ok: false; error: string };

export type AbandonedLeadRow = {
  id: number;
  source: LeadSource;
  name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  service_type: string | null;
  project_details: string | null;
  preferred_date: string | null;
  step_reached: number;
  contacted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
