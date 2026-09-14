import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { stamps, touch, alive } from "./lib/soft";
import { botStatus } from "./schema";
import { readSettings } from "./lib/settings";
import { sastDay } from "./lib/time";
import { BOTS } from "../packages/agents/registry";

/** The office floor. One subscription drives every desk. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const bots = alive(await ctx.db.query("bots").collect());
    const day = sastDay();
    const settings = await readSettings(ctx);

    const withExtras = await Promise.all(
      bots.map(async (bot) => {
        const budgetRow = await ctx.db
          .query("rateLimits")
          .withIndex("by_key", (q) => q.eq("key", `budget:${bot.key}:${day}`))
          .unique();
        const override = (settings?.budgets ?? {})[bot.key];
        const limit = typeof override === "number" ? override : bot.dailyBudget;

        const openEscalations = alive(
          await ctx.db
            .query("escalations")
            .withIndex("by_bot", (q) => q.eq("botKey", bot.key).eq("status", "open"))
            .collect(),
        ).length;

        const openTasks = alive(
          await ctx.db
            .query("tasks")
            .withIndex("by_bot", (q) => q.eq("botKey", bot.key).eq("status", "in_progress"))
            .collect(),
        ).length;

        return {
          ...bot,
          budgetUsed: budgetRow?.count ?? 0,
          budgetLimit: limit,
          openEscalations,
          openTasks,
        };
      }),
    );

    // Registry order, so the floor plan never reshuffles itself.
    const order = new Map(BOTS.map((b, i) => [b.key, i]));
    return withExtras.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
  },
});

export const byKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) =>
    await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

export const setStatus = internalMutation({
  args: {
    key: v.string(),
    status: botStatus,
    /** The speech bubble. Keep it short — the office renderer clips at 8 words. */
    currentTask: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, { key, status, currentTask, lastError }) => {
    const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bot) return;
    // A bot put off shift by STOP does not quietly bring itself back.
    if (bot.status === "off_shift" && status !== "off_shift") {
      const settings = await readSettings(ctx);
      if (settings?.killSwitch.active) return;
    }
    await ctx.db.patch(bot._id, {
      status,
      ...(currentTask !== undefined ? { currentTask: trimBubble(currentTask) } : {}),
      ...(lastError !== undefined ? { lastError } : {}),
      ...(status === "working" ? { lastRunAt: Date.now() } : {}),
      ...touch(),
    });
  },
});

function trimBubble(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.length <= 8 ? text.trim() : `${words.slice(0, 8).join(" ")}…`;
}

/** Edit a bot's system prompt. Marks it as yours — re-seeding will not overwrite it. */
export const updatePrompt = mutation({
  args: { key: v.string(), systemPrompt: v.string() },
  handler: async (ctx, { key, systemPrompt }) => {
    const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bot) throw new Error(`No bot called "${key}".`);
    await ctx.db.patch(bot._id, { systemPrompt, promptEditedAt: Date.now(), ...touch() });
    return { ok: true };
  },
});

/** Revert to the prompt in packages/agents/<bot>/prompt.md. */
export const resetPrompt = mutation({
  args: { key: v.string(), filePrompt: v.string() },
  handler: async (ctx, { key, filePrompt }) => {
    const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bot) throw new Error(`No bot called "${key}".`);
    await ctx.db.patch(bot._id, {
      systemPrompt: filePrompt,
      promptEditedAt: undefined,
      ...touch(),
    });
    return { ok: true };
  },
});

export const toggleTool = mutation({
  args: { key: v.string(), tool: v.string(), enabled: v.boolean() },
  handler: async (ctx, { key, tool, enabled }) => {
    const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bot) throw new Error(`No bot called "${key}".`);
    const disabled = new Set(bot.toolsDisabled);
    if (enabled) disabled.delete(tool);
    else disabled.add(tool);
    await ctx.db.patch(bot._id, { toolsDisabled: [...disabled], ...touch() });
  },
});

export const setScheduleEnabled = mutation({
  args: { key: v.string(), enabled: v.boolean() },
  handler: async (ctx, { key, enabled }) => {
    const bot = await ctx.db.query("bots").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!bot) throw new Error(`No bot called "${key}".`);
    await ctx.db.patch(bot._id, {
      scheduleEnabled: enabled,
      status: enabled ? "idle" : "off_shift",
      currentTask: enabled ? "Back on shift" : "Off shift",
      ...touch(),
    });
  },
});

/** Bring bots back after a STOP is lifted. Deliberately a separate, explicit act. */
export const resumeAll = mutation({
  args: {},
  handler: async (ctx) => {
    const settings = await readSettings(ctx);
    if (settings?.killSwitch.active) {
      throw new Error("Lift the STOP first — bots cannot come back on shift while it is engaged.");
    }
    const bots = alive(await ctx.db.query("bots").collect());
    let n = 0;
    for (const bot of bots) {
      if (bot.status === "off_shift" && bot.scheduleEnabled) {
        await ctx.db.patch(bot._id, { status: "idle", currentTask: "Back on shift", ...touch() });
        n++;
      }
    }
    return { resumed: n };
  },
});

/** Notes typed into a bot's chat box. */
export const chat = mutation({
  args: { key: v.string(), message: v.string() },
  handler: async (ctx, { key, message }) => {
    const id = await ctx.db.insert("tasks", {
      botKey: key,
      title: message.split("\n")[0].slice(0, 120),
      detail: message,
      status: "todo" as const,
      priority: 1,
      retries: 0,
      maxRetries: 2,
      ...stamps(),
    });
    return id;
  },
});
