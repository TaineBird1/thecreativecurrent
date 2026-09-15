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
import type { Id } from "../_generated/dataModel";
import { HaltedError } from "./settings";
import { checkHalt, haltMessage, isHalted } from "./killSwitch";

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

  const bot = await ctx.runQuery(api.bots.byKey, { key: opts.botKey });
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
    const name = err instanceof Error ? err.name : "";

    // Whatever went wrong, hand the task back rather than leaving it stuck in
    // "in progress" where nothing will ever pick it up again.
    if (claimed) {
      await ctx.runMutation(internal.tasks.setStatus, {
        id: claimed.id,
        status: name === "BudgetExceededError" || name === "HaltedError" ? "todo" : "failed",
        error: message,
      });
    }

    if (name === "BudgetExceededError") {
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

    if (err instanceof HaltedError || name === "HaltedError") {
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
  const bot = await ctx.runQuery(api.bots.byKey, { key: args.botKey });
  if (!bot) throw new Error(`No bot called "${args.botKey}".`);
  const result = await ctx.runAction(api.llm.complete, {
    botKey: args.botKey,
    purpose: args.purpose,
    system: bot.systemPrompt,
    user: args.user,
    tier: args.tier ?? "reasoning",
    json: true,
    temperature: args.temperature,
    maxOutputTokens: args.maxOutputTokens,
    runId: args.runId,
  });
  return { text: result.text, provider: result.provider, fellBack: result.fellBack };
}
