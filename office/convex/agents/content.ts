"use node";
/**
 * Zanele — Content.
 *
 * Works through the calendar the Strategy bot maintains. Everything lands in the
 * drafts library. There is no publish path in this file, deliberately: bots do
 * not post, and the way to be sure of that is for the capability not to exist.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { gateAll } from "../../packages/shared/guards";

const KINDS = ["blog", "linkedin", "instagram", "newsletter", "video_script"] as const;
type Kind = (typeof KINDS)[number];

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "content", trigger: trigger ?? "cron", bubble: "Writing from the calendar" },
      async (handle) => {
        // A direct instruction is a brief. Write that instead of the calendar.
        if (handle.task) {
          await handle.say(`Writing what you asked for`);
          return await writeOne(ctx, handle.runId, "blog", handle.task.detail);
        }

        const item = await ctx.runQuery(api.library.nextCalendarItem, {});
        if (!item) {
          // Idle is acceptable. It does not invent a blog post to look busy.
          return "Nothing on the calendar to write. Strategy fills it on Mondays.";
        }

        await handle.say(`Writing: ${item.title.slice(0, 30)}`);
        const angle = item.body.replace(/^ANGLE:\s*/, "");

        const { text } = await think(ctx, {
          botKey: "content",
          purpose: "draft_content",
          runId: handle.runId,
          user: [
            `Write this piece. Kind: ${item.kind}.`,
            `Working title: ${item.title}`,
            `The angle Strategy set: ${angle}`,
            item.tags.includes("tier1") ? "Audience: small construction and trades owners." : "",
            item.tags.includes("tier2") ? "Audience: solar installers." : "",
            item.tags.includes("tier3") ? "Audience: guest house and B&B owners." : "",
            "",
            "Follow the format rules in your instructions for this kind. No price. No promise about rankings, traffic or enquiries.",
          ]
            .filter(Boolean)
            .join("\n"),
          temperature: 0.8,
          maxOutputTokens: 2400,
        });

        const draft = parseJson<{ title: string; body: string; tags?: string[] }>(text);
        const body = (draft.body ?? "").trim();
        if (!body) return "The model returned an empty draft — nothing saved.";

        // Content is the likeliest place a ranking promise sneaks in, since a
        // blog post about SEO practically invites one.
        const verdict = gateAll({ title: draft.title, body });
        if (!verdict.clear) {
          await ctx.runMutation(internal.approvals.create, {
            kind: "content",
            botKey: "content",
            title: draft.title ?? item.title,
            body,
            reason: verdict.reason,
            guard: verdict.guard!,
            matches: verdict.matches,
          });
          await ctx.runMutation(internal.library.fillCalendarItem, {
            id: item._id,
            body,
            title: draft.title ?? item.title,
            tags: [...item.tags, "held"],
          });
          return `Drafted "${draft.title ?? item.title}" — held for approval. ${verdict.reason}`;
        }

        await ctx.runMutation(internal.library.fillCalendarItem, {
          id: item._id,
          body,
          title: draft.title ?? item.title,
          tags: [...new Set([...item.tags, ...(draft.tags ?? [])])],
        });
        return `Drafted "${draft.title ?? item.title}". It's in the Library for you to post.`;
      },
    );
    return outcome.summary;
  },
});

/** Write one piece on demand, outside the calendar. */
export const write = action({
  args: { kind: v.string(), brief: v.string() },
  handler: async (ctx, { kind, brief }): Promise<string> => {
    if (!KINDS.includes(kind as Kind)) {
      return `"${kind}" isn't something Content writes. Pick one of: ${KINDS.join(", ")}.`;
    }
    const outcome = await withRun(
      ctx,
      { botKey: "content", trigger: "manual", bubble: `Writing a ${kind}` },
      async (handle) => await writeOne(ctx, handle.runId, kind as Kind, brief),
    );
    return outcome.summary;
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.content.run, { trigger: "manual" }),
});

/**
 * Write one piece and put it in the Library, or in Approvals if a guard
 * catches it. Shared by the on-demand action and by a direct instruction
 * typed at Zanele's desk.
 */
async function writeOne(
  ctx: Parameters<typeof withRun>[0],
  runId: string,
  kind: Kind,
  brief: string,
): Promise<string> {
  const { text } = await think(ctx, {
    botKey: "content",
    purpose: "draft_content",
    runId,
    user: `Write a ${kind}.\n\nBrief from Taine:\n${brief}\n\nFollow the format rules for this kind in your instructions.`,
    temperature: 0.8,
    maxOutputTokens: 2400,
  });

  const draft = parseJson<{ title: string; body: string; tags?: string[] }>(text);
  const body = (draft.body ?? "").trim();
  if (!body) return "The model returned nothing usable.";

  const verdict = gateAll({ title: draft.title, body });
  if (!verdict.clear) {
    await ctx.runMutation(internal.approvals.create, {
      kind: "content",
      botKey: "content",
      title: draft.title ?? brief.slice(0, 60),
      body,
      reason: verdict.reason,
      guard: verdict.guard!,
      matches: verdict.matches,
    });
    return `Written — held for approval. ${verdict.reason}`;
  }

  await ctx.runMutation(internal.library.saveDraft, {
    botKey: "content",
    kind,
    title: draft.title ?? brief.slice(0, 60),
    body,
    tags: draft.tags ?? [],
  });
  return `Written. "${draft.title ?? brief.slice(0, 40)}" is in the Library.`;
}
