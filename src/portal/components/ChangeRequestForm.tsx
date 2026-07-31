import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { ScreenshotUploader } from "./ScreenshotUploader";

type ChangeRequestFormProps = {
  customerId: number;
  onSubmitted: () => void;
};

export function ChangeRequestForm({ customerId, onSubmitted }: ChangeRequestFormProps) {
  const [description, setDescription] = useState("");
  const [screenshotPaths, setScreenshotPaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from("change_requests").insert({
      customer_id: customerId,
      description,
      screenshot_paths: screenshotPaths,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    setDescription("");
    setScreenshotPaths([]);
    setSubmitting(false);
    onSubmitted();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 className="font-sans text-lg font-semibold">Request a Change</h2>

      <div className="grid gap-2">
        <label htmlFor="cr-description" className="text-sm text-muted-foreground">
          What would you like changed?
        </label>
        <textarea
          id="cr-description"
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="resize-none rounded-lg border border-border bg-black px-4 py-3 text-foreground outline-none focus:border-primary"
        />
      </div>

      <ScreenshotUploader customerId={customerId} paths={screenshotPaths} onChange={setScreenshotPaths} />

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Request"}
      </button>
    </form>
  );
}
