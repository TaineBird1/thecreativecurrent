import { v } from "convex/values";
import { query } from "./_generated/server";
import { authedQuery } from "./lib/authed";
import { alive } from "./lib/soft";

/**
 * The live activity feed on the right of the office.
 *
 * Merged from several tables rather than written to a dedicated events table:
 * one less thing to keep in sync, and nothing can "happen" without appearing
 * here, because it reads the real records rather than a parallel log somebody
 * has to remember to write to.
 */
export const feed = authedQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = limit ?? 60;

    const [leadEvents, emails, runs, approvals, escalations, drafts] = await Promise.all([
      ctx.db.query("leadEvents").order("desc").take(take),
      ctx.db.query("emails").order("desc").take(take),
      ctx.db.query("runs").order("desc").take(take),
      ctx.db.query("approvals").order("desc").take(30),
      ctx.db.query("escalations").order("desc").take(20),
      ctx.db.query("contentDrafts").order("desc").take(20),
    ]);

    // Business names are fine here — this screen is Taine's. It is only the
    // LLM that never sees real contact details.
    const leads = new Map(alive(await ctx.db.query("leads").collect()).map((l) => [l._id, l]));

    type Item = {
      id: string;
      at: number;
      botKey: string;
      kind: string;
      text: string;
      tone: "normal" | "good" | "warn" | "bad";
    };
    const items: Item[] = [];

    for (const e of alive(leadEvents)) {
      const lead = leads.get(e.leadId);
      items.push({
        id: e._id,
        at: e.createdAt,
        botKey: e.botKey,
        kind: e.type,
        text: `${lead ? lead.businessName : "A lead"} — ${e.detail}`,
        tone: e.type === "discarded" ? "warn" : "normal",
      });
    }

    for (const e of alive(emails)) {
      const lead = e.leadId ? leads.get(e.leadId) : undefined;
      const who = lead?.businessName ?? e.to;
      if (e.status === "sent") {
        items.push({
          id: e._id,
          at: e.createdAt,
          botKey: e.botKey,
          kind: "email_sent",
          text: `Sent to ${who}${e.sequenceStep ? ` — sequence ${e.sequenceStep}/3` : ""}`,
          tone: "good",
        });
      } else if (e.status === "blocked") {
        items.push({
          id: e._id,
          at: e.createdAt,
          botKey: e.botKey,
          kind: "email_blocked",
          text: `Held back an email to ${who} — ${e.error ?? "blocked"}`,
          tone: "warn",
        });
      } else if (e.status === "failed") {
        items.push({
          id: e._id,
          at: e.createdAt,
          botKey: e.botKey,
          kind: "email_failed",
          text: `Failed to send to ${who} — ${e.error ?? "unknown error"}`,
          tone: "bad",
        });
      } else if (e.direction === "in") {
        items.push({
          id: e._id,
          at: e.createdAt,
          botKey: e.botKey,
          kind: "reply",
          text: `${who} replied${e.classification ? ` — ${e.classification.replace("_", " ")}` : ""}`,
          tone: "good",
        });
      }
    }

    for (const r of alive(runs)) {
      if (r.status === "running") continue;
      items.push({
        id: r._id,
        at: r.finishedAt ?? r.createdAt,
        botKey: r.botKey,
        kind: `run_${r.status}`,
        text:
          r.status === "ok"
            ? (r.summary ?? "Finished a run")
            : r.status === "budget_exceeded"
              ? "Out of LLM budget for today"
              : r.status === "halted"
                ? "Stopped mid-run — STOP is engaged"
                : `Run failed — ${r.error ?? "unknown"}`,
        tone: r.status === "ok" ? "normal" : r.status === "error" ? "bad" : "warn",
      });
    }

    for (const a of alive(approvals)) {
      items.push({
        id: a._id,
        at: a.createdAt,
        botKey: a.botKey,
        kind: "approval",
        text:
          a.status === "pending"
            ? `Needs your approval — ${a.title}`
            : `Approval ${a.status} — ${a.title}`,
        tone: a.status === "pending" ? "warn" : "normal",
      });
    }

    for (const e of alive(escalations)) {
      items.push({
        id: e._id,
        at: e.createdAt,
        botKey: e.botKey,
        kind: "escalation",
        text: `${e.status === "open" ? "Escalated" : "Resolved"}: ${e.title}`,
        tone: e.status === "open" ? "bad" : "normal",
      });
    }

    for (const d of alive(drafts)) {
      items.push({
        id: d._id,
        at: d.createdAt,
        botKey: d.botKey,
        kind: "draft",
        text: `Drafted ${d.kind.replace("_", " ")}: ${d.title}`,
        tone: "normal",
      });
    }

    return items.sort((a, b) => b.at - a.at).slice(0, take);
  },
});
