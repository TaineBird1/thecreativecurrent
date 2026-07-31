import { useState } from "react";
import type { LeadApiResponse, LeadPayload } from "../lib/leads";

const GENERIC_ERROR = "Something went wrong sending your message. Please try again, or email us directly.";

export function useLeadSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(payload: LeadPayload): Promise<boolean> {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: LeadApiResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(GENERIC_ERROR);
        return false;
      }
      setSuccess(true);
      return true;
    } catch {
      setError(GENERIC_ERROR);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { submit, isSubmitting, error, success };
}
