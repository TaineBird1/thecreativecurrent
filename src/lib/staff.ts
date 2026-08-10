import { z } from "zod";

export const inviteStaffSchema = z.object({
  email: z.string().trim().email(),
});

export type InviteStaffPayload = z.infer<typeof inviteStaffSchema>;

export type InviteStaffApiResponse = { ok: true } | { ok: false; error: string; issues?: unknown };

export type RemoveStaffApiResponse = { ok: true } | { ok: false; error: string };

export type StaffMember = {
  id: string;
  email: string;
  role: "owner" | "admin";
  created_at: string;
};
