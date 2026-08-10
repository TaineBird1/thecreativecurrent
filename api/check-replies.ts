import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { requireAdmin } from "./_lib/requireAdmin.js";
import { getSupabaseAdmin } from "./_lib/supabaseAdmin.js";
import { generateSuggestedReply } from "./_lib/aiReply.js";
import type { CheckRepliesApiResponse } from "../src/lib/prospects.js";

// Polls the admin's Gmail inbox via IMAP (same app password used for
// sending -- Gmail App Passwords work for both) and matches replies back to
// sent prospects by sender address. One search per candidate rather than a
// single broad inbox scan: simpler, and the candidate count here is small
// (only prospects currently in status='sent' with no reply yet), so the
// extra round trips don't matter.
async function checkReplies(): Promise<CheckRepliesApiResponse> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "GMAIL_USER or GMAIL_APP_PASSWORD is not set" };
  }

  const supabase = getSupabaseAdmin();
  const { data: candidates, error: fetchError } = await supabase
    .from("prospects")
    .select("id, email, business_name, draft_subject, draft_body, sent_at")
    .eq("status", "sent")
    .is("reply_received_at", null)
    .not("email", "is", null);

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }
  if (!candidates || candidates.length === 0) {
    return { ok: true, checked: 0, matched: 0, errors: [] };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let matched = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (const candidate of candidates) {
        if (!candidate.email) continue;
        try {
          const since = candidate.sent_at ? new Date(candidate.sent_at) : undefined;
          const uids = await client.search({ from: candidate.email, ...(since ? { since } : {}) }, { uid: true });
          if (!uids || uids.length === 0) continue;

          // Multiple matches: take the most recent -- that is the reply
          // worth acting on, not an earlier bounce or auto-reply.
          const latestUid = uids[uids.length - 1];
          const msg = await client.fetchOne(latestUid, { source: true }, { uid: true });
          if (!msg || !msg.source) continue;

          const parsed = await simpleParser(msg.source);
          const replyText = (parsed.text ?? "").trim().slice(0, 5000);
          if (!replyText) continue;

          const suggested = await generateSuggestedReply({
            businessName: candidate.business_name,
            originalSubject: candidate.draft_subject ?? "",
            originalBody: candidate.draft_body ?? "",
            replyBody: replyText,
          });

          const { error: updateError } = await supabase
            .from("prospects")
            .update({
              status: "replied",
              reply_body: replyText,
              reply_received_at: (parsed.date ?? new Date()).toISOString(),
              reply_message_id: parsed.messageId ?? null,
              ai_suggested_reply: suggested,
            })
            .eq("id", candidate.id);

          if (updateError) {
            errors.push(`${candidate.business_name}: ${updateError.message}`);
            continue;
          }
          matched++;
        } catch (e) {
          errors.push(`${candidate.business_name}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "IMAP connection failed" };
  }

  return { ok: true, checked: candidates.length, matched, errors };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET -- Vercel Cron. Doesn't verify CRON_SECRET itself, same as
  // outreach-run.ts, so this route checks it.
  if (req.method === "GET") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ ok: false, error: "unauthorized" } satisfies CheckRepliesApiResponse);
      return;
    }
    const result = await checkReplies();
    res.status(result.ok ? 200 : 500).json(result satisfies CheckRepliesApiResponse);
    return;
  }

  // POST -- admin-triggered manual check.
  if (req.method === "POST") {
    const auth = await requireAdmin(req);
    if (!auth.authorized) {
      res.status(auth.status).json({ ok: false, error: auth.error } satisfies CheckRepliesApiResponse);
      return;
    }
    const result = await checkReplies();
    res.status(result.ok ? 200 : 500).json(result satisfies CheckRepliesApiResponse);
    return;
  }

  res.status(405).json({ ok: false, error: "method_not_allowed" } satisfies CheckRepliesApiResponse);
}
