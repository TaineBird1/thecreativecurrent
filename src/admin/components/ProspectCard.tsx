import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { StatusBadge } from "../../components/StatusBadge";
import { IconChevronDown, IconThumbsDown, IconThumbsUp } from "./icons";
import { FOLLOW_UP_AFTER_DAYS, prospectStatusTone, type Prospect, type ProspectDraftApiResponse, type ProspectSendApiResponse } from "../../lib/prospects";

function initials(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Mirrors the eligibility check in AdminOutreachReview.tsx's loadFollowUps()
// (and the guards api/prospects-followup-send.ts re-checks server-side)
// exactly, so this badge never promises a follow-up that page wouldn't
// actually offer: sent, never followed up, an email on file, and past the
// window.
function isFollowUpDue(prospect: Prospect): boolean {
  if (prospect.status !== "sent") return false;
  if (prospect.followed_up_at) return false;
  if (!prospect.email || !prospect.sent_at) return false;
  const cutoff = Date.now() - FOLLOW_UP_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return new Date(prospect.sent_at).getTime() < cutoff;
}

export function ProspectCard({ prospect, onChange }: { prospect: Prospect; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const followUpDue = isFollowUpDue(prospect);
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
    // Drafting moved server-side (api/prospects-draft.ts) so it can call the
    // Claude API for a genuinely personalized opening, grounded in the same
    // `reason`/`email_defect` facts the old client-side buildOutreachDraft()
    // call used -- an API key can't live in this bundle. Falls back to the
    // same rule-based opener on the server if the AI call fails, so this
    // never leaves the button producing nothing.
    setLoading("draft");
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const res = await fetch("/api/prospects-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: prospect.id }),
      });
      const data: ProspectDraftApiResponse = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setSubject(data.prospect.draft_subject ?? "");
      setBody(data.prospect.draft_body ?? "");
      setExpanded(true);
      onChange();
    } catch {
      setError("Something went wrong generating this draft.");
    } finally {
      setLoading(null);
    }
  }

  async function saveDraft() {
    await updateFields({ draft_subject: subject, draft_body: body }, "save");
  }

  async function approve() {
    await updateFields({ status: "approved" }, "approve");
  }

  async function setInterested(value: boolean | null) {
    await updateFields({ interested: value }, "interested");
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
    <div className="overflow-hidden rounded-xl border border-border bg-black transition-colors hover:border-white/20">
      <div className="flex items-start gap-3 p-3.5">
        {prospect.photo_reference ? (
          <img
            src={`/api/prospects-search?ref=${encodeURIComponent(prospect.photo_reference)}`}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white/5 font-mono text-[11px] font-semibold text-muted-foreground">
            {initials(prospect.business_name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-sans text-sm font-semibold leading-tight text-foreground">
              {prospect.business_name}
            </h3>
            <StatusBadge label={prospect.status} tone={prospectStatusTone[prospect.status]} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {prospect.category || "—"} {prospect.address ? `· ${prospect.address}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3.5 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setInterested(prospect.interested === true ? null : true)}
            disabled={loading === "interested"}
            title="Interested"
            aria-pressed={prospect.interested === true}
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
              prospect.interested === true
                ? "border-green-500/40 bg-green-500/10 text-green-500"
                : "border-border text-muted-foreground hover:border-green-500/40 hover:text-green-500"
            }`}
          >
            <IconThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setInterested(prospect.interested === false ? null : false)}
            disabled={loading === "interested"}
            title="Not interested"
            aria-pressed={prospect.interested === false}
            className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
              prospect.interested === false
                ? "border-red-500/40 bg-red-500/10 text-red-500"
                : "border-border text-muted-foreground hover:border-red-500/40 hover:text-red-500"
            }`}
          >
            <IconThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!expanded && (
            <>
              {!prospect.draft_subject && (
                <button
                  type="button"
                  onClick={generateDraft}
                  disabled={loading === "draft"}
                  className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {loading === "draft" ? "Generating..." : "Generate draft"}
                </button>
              )}
              {prospect.draft_subject && prospect.status !== "approved" && prospect.status !== "sent" && (
                <button
                  type="button"
                  onClick={approve}
                  disabled={loading === "approve"}
                  className="rounded-lg border border-accent px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
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
                  className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {loading === "send" ? "Sending..." : "Send"}
                </button>
              )}
              {prospect.status === "sent" && followUpDue && (
                <Link to="/admin/outreach/review" title="Follow up from Daily Review">
                  <StatusBadge label="Follow-up due" tone="warning" />
                </Link>
              )}
              {prospect.status === "sent" && !followUpDue && (
                <span className="text-[11px] text-green-500">
                  Sent {prospect.sent_at ? new Date(prospect.sent_at).toLocaleDateString() : ""}
                </span>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            title={expanded ? "Collapse" : "Details"}
          >
            <IconChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/5 bg-white/[0.02] p-3.5">
          {(prospect.phone || prospect.maps_url) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
          )}

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
                {prospect.status === "sent" && followUpDue && (
                  <Link to="/admin/outreach/review" title="Follow up from Daily Review">
                    <StatusBadge label="Follow-up due" tone="warning" />
                  </Link>
                )}
                {prospect.status === "sent" && !followUpDue && (
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
      )}
    </div>
  );
}
