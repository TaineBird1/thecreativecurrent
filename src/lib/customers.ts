import { z } from "zod";

export const inviteCustomerSchema = z.object({
  business_name: z.string().trim().min(1),
  contact_name: z.string().trim().optional(),
  contact_email: z.string().trim().email(),
  website_url: z.string().trim().optional(),
  lead_id: z.number().optional(),
});

export type InviteCustomerPayload = z.infer<typeof inviteCustomerSchema>;

export type InviteCustomerApiResponse =
  | { ok: true; customer_id: number }
  | { ok: false; error: string; issues?: unknown };

export type Customer = {
  id: number;
  business_name: string;
  contact_name: string | null;
  contact_email: string;
  website_url: string | null;
  tracking_site_key: string;
  lead_id: number | null;
  status: "active" | "inactive";
  created_at: string;
};
