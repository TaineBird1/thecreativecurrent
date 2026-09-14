import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { stamps, touch, alive, softDelete } from "./lib/soft";

/** Content drafts and media assets. Bots write here; Taine takes things out. */

export const drafts = query({
  args: { kind: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { kind, limit }) => {
    const rows = alive(await ctx.db.query("contentDrafts").order("desc").take((limit ?? 100) * 2));
    return (kind ? rows.filter((d) => d.kind === kind) : rows).slice(0, limit ?? 100);
  },
});

export const saveDraft = internalMutation({
  args: {
    botKey: v.string(),
    kind: v.union(
      v.literal("blog"),
      v.literal("linkedin"),
      v.literal("instagram"),
      v.literal("newsletter"),
      v.literal("video_script"),
      v.literal("ad_copy"),
      v.literal("proposal"),
      v.literal("contract"),
    ),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("needs_approval"),
        v.literal("approved"),
        v.literal("posted_by_boss"),
      ),
    ),
    calendarDate: v.optional(v.string()),
    approvalId: v.optional(v.id("approvals")),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("contentDrafts", {
      ...args,
      status: args.status ?? ("draft" as const),
      ...stamps(),
    }),
});

/**
 * "Posted" means Taine posted it by hand. No bot publishes anywhere — this is
 * him ticking it off, not a bot reporting success.
 */
export const markPosted = mutation({
  args: { id: v.id("contentDrafts") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "posted_by_boss" as const, ...touch() });
  },
});

export const archiveDraft = mutation({
  args: { id: v.id("contentDrafts") },
  handler: async (ctx, { id }) => await softDelete(ctx, id),
});

export const media = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) =>
    alive(await ctx.db.query("mediaAssets").order("desc").take(limit ?? 100)),
});

export const saveMedia = internalMutation({
  args: {
    botKey: v.string(),
    kind: v.union(
      v.literal("image"),
      v.literal("thumbnail"),
      v.literal("storyboard"),
      v.literal("brand_graphic"),
    ),
    title: v.string(),
    prompt: v.string(),
    provider: v.string(),
    url: v.optional(v.string()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => await ctx.db.insert("mediaAssets", { ...args, ...stamps() }),
});

/** The content calendar the Content bot works from. Maintained by Strategy. */
export const calendar = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("contentDrafts").collect());
    return rows
      .filter((d) => d.calendarDate)
      .sort((a, b) => (a.calendarDate ?? "").localeCompare(b.calendarDate ?? ""));
  },
});

/** What Content should write next: calendar items with no body yet. */
export const nextCalendarItem = query({
  args: {},
  handler: async (ctx) => {
    const rows = alive(await ctx.db.query("contentDrafts").collect());
    const pending = rows
      .filter((d) => d.calendarDate && d.body.trim().length < 40)
      .sort((a, b) => (a.calendarDate ?? "").localeCompare(b.calendarDate ?? ""));
    return pending[0] ?? null;
  },
});

export const fillCalendarItem = internalMutation({
  args: { id: v.id("contentDrafts"), body: v.string(), title: v.optional(v.string()), tags: v.optional(v.array(v.string())) },
  handler: async (ctx, { id, body, title, tags }) => {
    await ctx.db.patch(id, {
      body,
      ...(title ? { title } : {}),
      ...(tags ? { tags } : {}),
      status: "draft" as const,
      ...touch(),
    });
  },
});
