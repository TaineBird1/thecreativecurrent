import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { StatusBadge } from "../../components/StatusBadge";
import { buildOutreachDraft } from "../../lib/outreachTemplate";
import { prospectStatusTone, type Prospect, type ProspectSendApiResponse } from "../../lib/prospects";

export function ProspectCard({ prospect, onChange }: { prospect: Prospect; onChange: () => void }) {
  const [email, setEmail] = useState(prospect.email ?? "");
  const [subject, setSubject] = useState(prospect.draft_subject ?? "");
  const [body, setBody] = useState(prospect.draft_body ?? "");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateFields(fields: Record<string, unknown>, key: string) {
    setLoading(key);
    setError(null);
    const { error: updateError } = await supabase.from("prospects").update(fields).eq("id", prospect.id);
    setLoading(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChange();
  }

  async function saveEmail() {
    await updateFields({ email }, "email");
  }

  async function generateDraft() {
    const draft = buildOutreachDraft(prospect.business_name, prospect.category);
    setSubject(draft.subject);
    setBody(draft.body);
    await updateFields(
      {
        draft_subject: draft.subject,
        draft_body: draft.body,
        status: prospect.status === "new" ? "drafted" : prospect.status,
      },
      "draft"
    );
  }

  async function saveDraft() {
    await updateFields({ draft_subject: subject, draft_body: body }, "save");
  }

  async function approve() {
    await updateFields({ status: "approved" }, "approve");
  }

  async function send() {
    setLoading("send");
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch("/api/prospects-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: prospect.id }),
      });
      const data: ProspectSendApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      onChange();
    } catch {
      setError("Something went wrong sending this email.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-black p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-sans text-sm font-semibold text-foreground">{prospect.business_name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {prospect.category || "—"} {prospect.address ? `· ${prospect.address}` : ""}
          </p>
          <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
            {prospect.phone && <span>{prospect.phone}</span>}
            {prospect.maps_url && (
              <a
                href={prospect.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Maps
              </a>
            )}
          </div>
        </div>
        <StatusBadge label={prospect.status} tone={prospectStatusTone[prospect.status]} />
      </div>

      <div className="grid gap-2">
        <label className="text-xs text-muted-foreground">Email (add manually if not found automatically)</label>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="business@example.com"
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={saveEmail}
            disabled={loading === "email"}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {!prospect.draft_subject ? (
        <button
          type="button"
          onClick={generateDraft}
          disabled={loading === "draft"}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {loading === "draft" ? "Generating..." : "Generate draft"}
        </button>
      ) : (
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={loading === "save"}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
            >
              Save edits
            </button>
            {prospect.status !== "approved" && prospect.status !== "sent" && (
              <button
                type="button"
                onClick={approve}
                disabled={loading === "approve"}
                className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
              >
                Approve
              </button>
            )}
            {prospect.status === "approved" && (
              <button
                type="button"
                onClick={send}
                disabled={loading === "send" || !email}
                title={!email ? "Add an email address first" : ""}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
              >
                {loading === "send" ? "Sending..." : "Approve & Send"}
              </button>
            )}
            {prospect.status === "sent" && (
              <span className="text-xs text-green-500">
                Sent {prospect.sent_at ? new Date(prospect.sent_at).toLocaleDateString() : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
