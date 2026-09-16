/**
 * The wrapper every bot run goes through.
 *
 * It owns the boring, easy-to-forget parts: check STOP before doing anything,
 * open a run record, set the desk to "working" with a speech bubble, translate
 * the two expected failures (out of budget, STOP mid-run) into states a human
 * can read on the office floor, and always close the run even when the body
 * throws. A bot's own code gets to be about its job.
 */
import type { ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { machineArgs } from "./machine";
import type { Id } from "../_generated/dataModel";
import { HaltedError } from "./settings";
import { checkHalt, haltMessage, isHalted } from "./killSwitch";
import { errorIsNamed } from "../../packages/shared/errors";

export interface ClaimedTask {
  id: Id<"tasks">;
  title: string;
  detail: string;
}

export interface RunHandle {
  runId: Id<"runs">;
  /**
   * A direct instruction waiting for this bot — from the chat box on its desk,
   * or assigned by the Orchestrator. Null when there is nothing waiting and the
   * bot should just do its usual round.
   */
  task: ClaimedTask | null;
  /** Update the speech bubble mid-run. */
  say(bubble: string): Promise<void>;
  /** Check STOP inside a loop. Returns true if the run should stop now. */
  stopped(): Promise<boolean>;
}

export interface RunOutcome {
  ok: boolean;
  summary: string;
}

export async function withRun(
  ctx: ActionCtx,
  opts: {
    botKey: string;
    trigger: "cron" | "manual" | "orchestrator" | "chat";
    bubble: string;
    taskId?: Id<"tasks">;
    /**
     * Take the next instruction waiting for this bot, if there is one, and hand
     * it to the body. Default true — a bot that ignores what it was told is
     * worse than one that does nothing.
     */
    claimTask?: boolean;
  },
  body: (handle: RunHandle) => Promise<string>,
): Promise<RunOutcome> {
  // STOP, checked before any work at all rather than at schedule time.
  const halt = await checkHalt(ctx);
  if (halt.halted) return { ok: false, summary: haltMessage(halt) };

  const bot = await ctx.runQuery(api.bots.byKey, { ...machineArgs(),  key: opts.botKey });
  if (!bot) return { ok: false, summary: `No bot called "${opts.botKey}".` };
  if (bot.status === "off_shift" && opts.trigger === "cron") {
    return { ok: false, summary: `${bot.name} is off shift.` };
  }

  const runId: Id<"runs"> = await ctx.runMutation(internal.runs.start, {
    botKey: opts.botKey,
    trigger: opts.trigger,
    taskId: opts.taskId,
  });

  // An instruction you typed outranks whatever the bot was going to do anyway.
  const claimed: ClaimedTask | null =
    opts.claimTask === false
      ? null
      : await ctx.runMutation(internal.tasks.claimNext, { botKey: opts.botKey });

  await ctx.runMutation(internal.bots.setStatus, {
    key: opts.botKey,
    status: "working",
    currentTask: claimed ? claimed.title : opts.bubble,
    lastError: undefined,
  });

  const handle: RunHandle = {
    runId,
    task: claimed,
    say: async (bubble) => {
      await ctx.runMutation(internal.bots.setStatus, {
        key: opts.botKey,
        status: "working",
        currentTask: bubble,
      });
    },
    // Called inside every bot's own loops, so a STOP mid-batch stops the batch.
    stopped: () => isHalted(ctx),
  };

  try {
    const summary = await body(handle);
    if (claimed) {
      await ctx.runMutation(internal.tasks.setStatus, {
        id: claimed.id,
        status: "done",
        result: summary,
      });
    }
    await ctx.runMutation(internal.runs.finish, { id: runId, status: "ok", summary });
    await ctx.runMutation(internal.bots.setStatus, {
      key: opts.botKey,
      status: "idle",
      currentTask: summary.split(".")[0] || "Done",
      // A run that worked means the last problem is history, not news.
      clearError: true,
    });
    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Not err.name: these are thrown inside api.llm.complete and arrive here
    // through ctx.runAction, which strips the class and leaves the name in the
    // message. See packages/shared/errors.ts.
    const outOfBudget = errorIsNamed(err, "BudgetExceededError");
    const rateLimited = errorIsNamed(err, "AllProvidersRateLimitedError");
    const halted = err instanceof HaltedError || errorIsNamed(err, "HaltedError");

    // Whatever went wrong, hand the task back rather than leaving it stuck in
    // "in progress" where nothing will ever pick it up again.
    if (claimed) {
      await ctx.runMutation(internal.tasks.setStatus, {
        id: claimed.id,
        // Handed back rather than failed: none of these is the task's fault,
        // and a failure here counts a retry and eventually lands in the Boss
        // inbox as a decision he cannot make.
        status: outOfBudget || halted || rateLimited ? "todo" : "failed",
        error: message,
      });
    }

    if (outOfBudget) {
      // Not an error — an expected, visible, self-clearing state.
      await ctx.runMutation(internal.runs.finish, {
        id: runId,
        status: "budget_exceeded",
        summary: message,
      });
      await ctx.runMutation(internal.bots.setStatus, {
        key: opts.botKey,
        status: "blocked",
        currentTask: "Out of LLM budget today",
        lastError: message,
      });
      return { ok: false, summary: message };
    }

    if (rateLimited) {
      // Both free tiers are spent. Not a fault, and not something a human can
      // act on — the window resets on its own. Treated like the budget case:
      // visible, self-clearing, task handed back rather than failed, and no
      // escalation, because there is nothing in the Boss inbox he could do
      // about Google's quota except wait.
      await ctx.runMutation(internal.runs.finish, {
        id: runId,
        status: "budget_exceeded",
        summary: message,
      });
      await ctx.runMutation(internal.bots.setStatus, {
        key: opts.botKey,
        status: "blocked",
        currentTask: "Waiting — free tier is busy",
        lastError: message,
      });
      return { ok: false, summary: message };
    }

    if (halted) {
      await ctx.runMutation(internal.runs.finish, { id: runId, status: "halted", summary: message });
      await ctx.runMutation(internal.bots.setStatus, {
        key: opts.botKey,
        status: "off_shift",
        currentTask: "Stopped by the boss",
      });
      return { ok: false, summary: message };
    }

    await ctx.runMutation(internal.runs.finish, { id: runId, status: "error", error: message });
    await ctx.runMutation(internal.bots.setStatus, {
      key: opts.botKey,
      status: "blocked",
      currentTask: "Hit a problem",
      lastError: message,
    });
    await ctx.runMutation(internal.escalations.raise, {
      botKey: opts.botKey,
      title: `${bot.name} couldn't finish a run`,
      detail: message,
      severity: "warn",
    });
    return { ok: false, summary: message };
  }
}

/**
 * The least output budget a reasoning-tier call may have.
 *
 * A reasoning model spends output tokens thinking before it writes a word you
 * can see, and that spending is invisible from here — the ceiling is reached
 * with almost nothing returned. Thabo's KPI report had 1,200 and came back cut
 * off after 380 characters; Lerato's first email had 900 and arrived as half an
 * email. Both looked like the model misbehaving rather than a budget we set.
 *
 * Cheap-tier calls are left alone: they run on flash-lite, which does not do
 * this, and some of them genuinely want a tiny answer (leadgen's instruction
 * reader asks for two words and gets them on 300).
 *
 * The ceiling is a cap, not an allocation — raising it costs nothing when the
 * reply is short.
 */
const MIN_REASONING_OUTPUT_TOKENS = 2400;

/** Ask a bot's own model, using its live (possibly edited) system prompt. */
export async function think(
  ctx: ActionCtx,
  args: {
    botKey: string;
    purpose: string;
    user: string;
    runId?: string;
    tier?: "reasoning" | "cheap";
    temperature?: number;
    maxOutputTokens?: number;
  },
): Promise<{ text: string; provider: string; fellBack: boolean }> {
  const bot = await ctx.runQuery(api.bots.byKey, { ...machineArgs(), key: args.botKey });
  if (!bot) throw new Error(`No bot called "${args.botKey}".`);
  const tier = args.tier ?? "reasoning";
  const result = await ctx.runAction(api.llm.complete, {
    ...machineArgs(),
    botKey: args.botKey,
    purpose: args.purpose,
    system: bot.systemPrompt,
    user: args.user,
    tier,
    json: true,
    temperature: args.temperature,
    maxOutputTokens:
      tier === "reasoning"
        ? Math.max(args.maxOutputTokens ?? 0, MIN_REASONING_OUTPUT_TOKENS)
        : args.maxOutputTokens,
    runId: args.runId,
  });
  return { text: result.text, provider: result.provider, fellBack: result.fellBack };
}
