export const emailLogTypes = ["outreach", "lead_notification", "other"] as const;
export type EmailLogType = (typeof emailLogTypes)[number];

export const emailLogStatuses = ["sent", "failed"] as const;
export type EmailLogStatus = (typeof emailLogStatuses)[number];

export type EmailLog = {
  id: number;
  recipient: string;
  subject: string;
  type: EmailLogType;
  status: EmailLogStatus;
  error: string | null;
  prospect_id: number | null;
  lead_id: number | null;
  created_at: string;
};
