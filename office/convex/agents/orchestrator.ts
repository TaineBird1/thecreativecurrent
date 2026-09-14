"use node";
/**
 * Nomsa — Orchestrator / CEO.
 *
 * Two jobs: turn a goal Taine typed into assigned tasks, and write the morning
 * stand-up. It never does anyone else's work — it only decides what work exists
 * and who owns it.
 *
 * The one thing worth pointing at: `replan` refuses to retry a task unchanged
 * after two failures. Retrying the same failing thing on a schedule is how an
 * agent burns a whole day's free quota producing nothing, and it is the most
 * likely way this office would waste money if money were involved.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { api, internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { sastDay, DAY_MS } from "../lib/time";
import { BOTS } from "../../packages/agents/registry";

const VALID_BOTS = new Set(BOTS.map((b) => b.key));

/** The 07:00 SAST run: plan any new goals, re-plan failures, write the stand-up. */
export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "orchestrator", trigger: trigger ?? "cron", bubble: "Planning the day" },
      async (handle) => {
        const notes: string[] = [];

        // 1. Break down anything new Taine typed in.
        const unplanned = await ctx.runQuery(api.tasks.unplannedGoals, {});
        for (const goal of unplanned) {
          if (await handle.stopped()) return "Stopped mid-run.";
          await handle.say(`Breaking down: ${goal.text.slice(0, 40)}`);
          notes.push(await planGoal(ctx, goal, handle.runId));
        }

        // 2. Deal with failures before adding more work.
        await handle.say("Checking what failed yesterday");
        notes.push(await replanFailures(ctx));

        // 3. The stand-up.
        await handle.say("Writing your stand-up");
        notes.push(await writeStandup(ctx, handle.runId));

        return notes.filter(Boolean).join(" ");
      },
    );
    return outcome.summary;
  },
});

async function planGoal(
  ctx: Parameters<typeof withRun>[0],
  goal: { _id: string; text: string; detail?: string; targetDate?: string },
  runId: string,
): Promise<string> {
  // Capacity is real, so the planner is told about it rather than left to
  // invent forty tasks for one bot.
  const usage = await ctx.runQuery(api.rate.usageToday, {});
  const roster = BOTS.map(
    (b) => `- ${b.key} (${b.name}, ${b.role}): ${b.blurb} Budget ${b.dailyBudget} LLM calls/day.`,
  ).join("\n");

  const { text } = await think(ctx, {
    botKey: "orchestrator",
    purpose: "plan_goal",
    runId,
    user: [
      `Goal from Taine: ${goal.text}`,
      goal.detail ? `More detail: ${goal.detail}` : "",
      goal.targetDate ? `Target date: ${goal.targetDate}` : "",
      "",
      "The roster you can assign to:",
      roster,
      "",
      `The whole office shares roughly ${usage.totalLimit} LLM requests a day and has used ${usage.totalUsed} today.`,
      "Break this into tasks. One owner each, one sentence each, small enough to finish in a single run.",
      "Return the tasks JSON from your instructions.",
    ]
      .filter(Boolean)
      .join("\n"),
    maxOutputTokens: 1600,
  });

  const plan = parseJson<{ tasks?: { botKey: string; title: string; detail?: string; priority?: number }[]; notes?: string }>(text);
  const tasks = (plan.tasks ?? []).filter((t) => VALID_BOTS.has(t.botKey));
  const rejected = (plan.tasks ?? []).length - tasks.length;

  for (const task of tasks.slice(0, 12)) {
    await ctx.runMutation(internal.tasks.create, {
      goalId: goal._id as never,
      botKey: task.botKey,
      title: task.title,
      detail: task.detail,
      priority: task.priority ?? 3,
    });
  }
  await ctx.runMutation(internal.tasks.markGoalPlanned, { id: goal._id as never });

  if (tasks.length === 0) {
    await ctx.runMutation(internal.escalations.raise, {
      botKey: "orchestrator",
      title: `Couldn't turn a goal into tasks`,
      detail: `Goal: "${goal.text}"\n\nThe plan came back with nothing assignable${rejected ? ` (${rejected} task(s) named a bot that doesn't exist)` : ""}. It probably needs to be more specific, or it may be outside what the office can do.`,
      severity: "warn",
    });
    return `Couldn't plan "${goal.text.slice(0, 40)}".`;
  }
  return `Planned "${goal.text.slice(0, 40)}" into ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`;
}

/**
 * Re-plan, not retry.
 *
 * A task that has failed twice is not attempted a third time in the same shape.
 * It is either rewritten into something smaller or handed to Taine with a
 * specific question. Quietly retrying forever is the failure mode this guards
 * against.
 */
async function replanFailures(ctx: Parameters<typeof withRun>[0]): Promise<string> {
  const { tasks } = await ctx.runQuery(api.tasks.board, {});
  const failed = tasks.filter((t) => t.status === "failed");
  if (failed.length === 0) return "";

  let retried = 0;
  let escalated = 0;

  for (const task of failed) {
    if (task.retries < task.maxRetries) {
      await ctx.runMutation(internal.tasks.setStatus, { id: task._id, status: "todo" });
      retried++;
      continue;
    }
    await ctx.runMutation(internal.tasks.setStatus, { id: task._id, status: "blocked" });
    await ctx.runMutation(internal.escalations.raise, {
      botKey: "orchestrator",
      title: `"${task.title.slice(0, 60)}" has failed ${task.retries} times`,
      detail: [
        `Owner: ${task.botKey}`,
        `Last error: ${task.error ?? "not recorded"}`,
        "",
        "I've stopped retrying it — running the same thing again would just burn budget. It needs either a different approach or a decision from you.",
      ].join("\n"),
      severity: "warn",
    });
    escalated++;
  }
  return `${retried} task${retried === 1 ? "" : "s"} queued to retry, ${escalated} escalated to you.`;
}

async function writeStandup(ctx: Parameters<typeof withRun>[0], runId: string): Promise<string> {
  const since = Date.now() - DAY_MS;
  const [runs, leadCounts, sentToday, approvals, escalations, board, usage] = await Promise.all([
    ctx.runQuery(api.runs.recent, { limit: 80 }),
    ctx.runQuery(api.leads.counts, {}),
    ctx.runQuery(api.emails.sentTodayCount, {}),
    ctx.runQuery(api.approvals.pending, {}),
    ctx.runQuery(api.escalations.open, {}),
    ctx.runQuery(api.tasks.board, {}),
    ctx.runQuery(api.rate.usageToday, {}),
  ]);

  const yesterdayRuns = runs.filter((r) => r.startedAt > since);
  const facts = [
    `Runs in the last 24h: ${yesterdayRuns.length} (${yesterdayRuns.filter((r) => r.status === "ok").length} ok, ${yesterdayRuns.filter((r) => r.status === "error").length} failed).`,
    `Leads: ${leadCounts.total} total, ${leadCounts.qualified} qualified and waiting, ${leadCounts.contacted} contacted, ${leadCounts.replied + leadCounts.interested} replied, ${leadCounts.discarded} discarded off-niche.`,
    `Emails sent today: ${sentToday.count}.`,
    `Waiting on you: ${approvals.length} approval(s), ${escalations.length} escalation(s).`,
    `Tasks: ${board.tasks.filter((t) => t.status === "todo").length} to do, ${board.tasks.filter((t) => t.status === "blocked").length} blocked.`,
    `LLM budget used today: ${usage.totalUsed}/${usage.totalLimit}.`,
    approvals.length
      ? `Approvals waiting: ${approvals.map((a) => a.title).slice(0, 5).join("; ")}.`
      : "",
    escalations.length
      ? `Escalations: ${escalations.map((e) => `${e.botKey}: ${e.title}`).slice(0, 5).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await think(ctx, {
    botKey: "orchestrator",
    purpose: "write_standup",
    runId,
    user: [
      "Here are the real numbers from the last 24 hours. Write the stand-up.",
      "",
      facts,
      "",
      "Three sections, no padding. If nothing is blocked on Taine, needsYou is exactly \"Nothing.\" Do not manufacture work for him.",
    ].join("\n"),
    maxOutputTokens: 900,
  });

  const parsed = parseJson<{ yesterday: string; today: string; needsYou: string }>(text);
  await ctx.runMutation(internal.standups.save, {
    forDate: sastDay(),
    yesterday: parsed.yesterday ?? "",
    today: parsed.today ?? "",
    needsYou: parsed.needsYou ?? "Nothing.",
  });
  return "Stand-up written.";
}

/** "Plan this now" from the Goals screen. */
export const planNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.orchestrator.run, { trigger: "manual" }),
});
