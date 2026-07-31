export type ChangeRequestStatus = "submitted" | "in_progress" | "done";

export type ChangeRequest = {
  id: number;
  customer_id: number;
  description: string;
  screenshot_paths: string[];
  status: ChangeRequestStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

export const STORAGE_BUCKET = "change-request-screenshots";
