"use node";
/**
 * Naledi — Design / Media.
 *
 * Images come from Pollinations.ai: free, no key, no account, no card. Gemini's
 * image generation is used first when a key is present and the quota allows,
 * since the quality is better; Pollinations is the fallback that always works.
 *
 * There is no video rendering. Every free option is either a trial, a watermark,
 * or a queue that never finishes. So this bot produces storyboards and scripts
 * and says so, rather than shipping something that looks like video generation
 * and quietly fails.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";

/** Free, keyless image generation. The URL itself is the image. */
function pollinationsUrl(prompt: string, aspect: string): string {
  const [w, h] = aspect === "1:1" ? [1024, 1024] : aspect === "9:16" ? [720, 1280] : [1280, 720];
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
}

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "design", trigger: trigger ?? "cron", bubble: "Making assets for the drafts" },
      async (handle) => {
        // Make images for content that has been written but has nothing to go
        // with it. Working from real drafts beats inventing subjects.
        if (handle.task) {
          await handle.say("Making what you asked for");
          return await makeImage(ctx, handle.runId, handle.task.detail, "16:9");
        }

        const drafts = await ctx.runQuery(api.library.drafts, { limit: 30 });
        const needsArt = drafts.filter(
          (d) => (d.kind === "blog" || d.kind === "instagram" || d.kind === "linkedin") && d.body.length > 200,
        );
        if (needsArt.length === 0) {
          return "No written drafts waiting for artwork. Nothing made.";
        }

        const target = needsArt[0];
        await handle.say(`Artwork for: ${target.title.slice(0, 30)}`);

        const { text } = await think(ctx, {
          botKey: "design",
          purpose: "image_prompt",
          runId: handle.runId,
          user: [
            `Write an image prompt for this piece of content.`,
            `Title: ${target.title}`,
            `Opening: ${target.body.slice(0, 500)}`,
            "",
            "The audience is KZN trade businesses. Real sites, real bakkies, real Durban light — nothing that would look at home in a bank advert.",
            "Return the image JSON from your instructions.",
          ].join("\n"),
          maxOutputTokens: 1500,
        });

        const parsed = parseJson<{
          title: string;
          prompt: string;
          negativePrompt?: string;
          tags?: string[];
          aspect?: string;
        }>(text);
        if (!parsed.prompt) return "The model returned no usable image prompt.";

        const url = pollinationsUrl(parsed.prompt, parsed.aspect ?? "16:9");
        await ctx.runMutation(internal.library.saveMedia, {
          botKey: "design",
          kind: "image",
          title: parsed.title ?? target.title,
          prompt: parsed.prompt,
          provider: "pollinations",
          url,
          tags: [...(parsed.tags ?? []), "auto", target.kind],
        });
        return `Made artwork for "${target.title.slice(0, 40)}".`;
      },
    );
    return outcome.summary;
  },
});

export const image = action({
  args: { brief: v.string(), aspect: v.optional(v.string()) },
  handler: async (ctx, { brief, aspect }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "design", trigger: "manual", bubble: "Making an image" },
      async (handle) => await makeImage(ctx, handle.runId, brief, aspect ?? "16:9"),
    );
    return outcome.summary;
  },
});

/**
 * A storyboard, not a video. Named plainly so nobody expects a file.
 */
export const storyboard = action({
  args: { brief: v.string(), seconds: v.optional(v.number()) },
  handler: async (ctx, { brief, seconds }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "design", trigger: "manual", bubble: "Storyboarding a short video" },
      async (handle) => {
        const { text } = await think(ctx, {
          botKey: "design",
          purpose: "draft_storyboard",
          runId: handle.runId,
          user: [
            `Storyboard a ${seconds ?? 50}-second video: ${brief}`,
            "",
            "Assume it gets shot on a phone this afternoon. No crew, no studio, no drone.",
            "Return the storyboard JSON from your instructions.",
          ].join("\n"),
          maxOutputTokens: 1800,
        });

        const parsed = parseJson<{
          title: string;
          totalSeconds?: number;
          shots?: { n: number; seconds: number; onScreen: string; voiceover: string; note?: string }[];
        }>(text);
        const shots = parsed.shots ?? [];

        const body = [
          `# ${parsed.title ?? brief.slice(0, 60)}`,
          `${parsed.totalSeconds ?? seconds ?? 50} seconds, ${shots.length} shots.`,
          "",
          "> No rendered video — there is no reliable free video generation. This is a shooting script.",
          "",
          ...shots.map((s) =>
            [`## Shot ${s.n} — ${s.seconds}s`, `**On screen:** ${s.onScreen}`, `**Voiceover:** ${s.voiceover}`, s.note ? `*${s.note}*` : ""]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n\n");

        await ctx.runMutation(internal.library.saveDraft, {
          botKey: "design",
          kind: "video_script",
          title: parsed.title ?? brief.slice(0, 60),
          body,
          tags: ["storyboard", "video"],
        });
        return `Storyboarded ${shots.length} shots. It's a shooting script — nothing rendered, there's no free way to.`;
      },
    );
    return outcome.summary;
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.design.run, { trigger: "manual" }),
});

/**
 * Write an image prompt, generate through the free endpoint, and file it.
 * Shared by the on-demand action and by a brief typed at Naledi's desk.
 */
async function makeImage(
  ctx: Parameters<typeof withRun>[0],
  runId: string,
  brief: string,
  aspect: string,
): Promise<string> {
  const { text } = await think(ctx, {
    botKey: "design",
    purpose: "image_prompt",
    runId,
    user: `Write an image prompt for: ${brief}\n\nReturn the image JSON from your instructions.`,
    maxOutputTokens: 1500,
  });

  const parsed = parseJson<{ title: string; prompt: string; tags?: string[]; aspect?: string }>(text);
  if (!parsed.prompt) return "The model returned no usable image prompt.";

  const url = pollinationsUrl(parsed.prompt, parsed.aspect ?? aspect);
  await ctx.runMutation(internal.library.saveMedia, {
    botKey: "design",
    kind: "image",
    title: parsed.title ?? brief.slice(0, 60),
    prompt: parsed.prompt,
    provider: "pollinations",
    url,
    tags: parsed.tags ?? [],
  });
  return `Image made — it's in the Library.`;
}
