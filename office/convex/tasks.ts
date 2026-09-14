import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { stamps, touch, alive, getAlive } from "./lib/soft";
import { taskStatus } from "./schema";

export const board = query({
  args: {},
  handler: async (ctx) => {
    const tasks = alive(await ctx.db.query("tasks").collect());
    const goals = alive(await ctx.db.query("goals").collect());
    return {
      tasks: tasks.sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt),
      goals: goals.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const nextForBot = query({
  args: { botKey: v.string() },
  handler: async (ctx, { botKey }) => {
    const todo = alive(
      await ctx.db
        .query("tasks")
        .withIndex("by_bot", (q) => q.eq("botKey", botKey).eq("status", "todo"))
        .collect(),
    );
    return todo.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt)[0] ?? null;
  },
});

export const create = internalMutation({
  args: {
    goalId: v.optional(v.id("goals")),
    botKey: v.string(),
    title: v.string(),
    detail: v.optional(v.string()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      goalId: args.goalId,
      botKey: args.botKey,
      title: args.title,
      detail: args.detail,
      status: "todo" as const,
      priority: args.priority ?? 3,
      retries: 0,
      maxRetries: 2,
      ...stamps(),
    });
  },
});

export const setStatus = internalMutation({
  args: {
    id: v.id("tasks"),
    status: taskStatus,
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, result, error }) => {
    const task = await getAlive(ctx, id);
    if (!task) return;
    await ctx.db.patch(id, {
      status,
      result,
      error,
      ...(status === "in_progress" ? { startedAt: Date.now() } : {}),
      ...(status === "done" || status === "failed" ? { finishedAt: Date.now() } : {}),
      ...(status === "failed" ? { retries: task.retries + 1 } : {}),
      ...touch(),
    });
  },
});

export const moveTask = mutation({
  args: { id: v.id("tasks"), status: taskStatus },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status, ...touch() });
  },
});

// ── Goals ────────────────────────────────────────────────────────────────────
export const addGoal = mutation({
  args: { text: v.string(), detail: v.optional(v.string()), targetDate: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await ctx.db.insert("goals", { ...args, status: "active" as const, ...stamps() }),
});

export const setGoalStatus = mutation({
  args: {
    id: v.id("goals"),
    status: v.union(v.literal("active"), v.literal("achieved"), v.literal("abandoned")),
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status, ...touch() });
  },
});

export const unplannedGoals = query({
  args: {},
  handler: async (ctx) =>
    alive(await ctx.db.query("goals").withIndex("by_status", (q) => q.eq("status", "active")).collect())
      .filter((g) => !g.plannedAt),
});

export const markGoalPlanned = internalMutation({
  args: { id: v.id("goals") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { plannedAt: Date.now(), ...touch() });
  },
});
